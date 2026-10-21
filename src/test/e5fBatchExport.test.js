/**
 * e5fBatchExport.test.js
 *
 * E5f - batch export of the screen previews (src/screenBatch.js and the iSDA: Export All Screen Previews command).
 *   A. planning: sizes, file names (RECORD-LINESxCOLUMNS), name safety and collisions, the folder name, input checks, the cap.
 *   B. records: which are drawn and how (record-level indicator conditions, display-size conditions, empty records, record kinds).
 *   C. the files: SVG, HTML and text are exactly what the E5b / E5d serialisers give for the same screen, with the theme, ruler and style.
 *   D. the index page: every record and size, working links, skipped screens with their reason, escaping, no script.
 *   E. running: order, progress, cancel, a failed write, a failing render, sync and async file calls.
 *   F. the command on the vscode mock: no designer, cancelled picker, the happy path, an existing folder, cancel from the progress
 *      notification, theme and settings reaching the files, a failed write.
 *   G. package.json and the module.
 *
 * Run with: node src/test/e5fBatchExport.test.js   (needs `npm run compile`)
 */
'use strict';
const path = require('path');
const fs = require('fs');
const Module = require('module');

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'vscode') return require('./vscode-mock.js');
  return originalLoad.apply(this, arguments);
};

const vscodeMock = require('./vscode-mock.js');
const { check, failureCount } = require('./helpers/harness');
const { buildLine: L } = require('../fixtures/lineBuilder.js');
const B = require(path.join(__dirname, '../../dist/screenBatch.js'));
const X = require(path.join(__dirname, '../../dist/screenExport.js'));
const T = require(path.join(__dirname, '../../dist/screenText.js'));
const DspfEngine = require(path.join(__dirname, '../../dist/dspfEngine.js'));
const DspfParser = require(path.join(__dirname, '../../dist/dspfParser.js'));
const ext = require(path.join(__dirname, '../../dist/extension.js'));

const SOURCE = [
  L({ func: 'DSPSIZ(24 80 *DS3 27 132 *DS4)' }),
  L({ nameType: 'R', name: 'HDRREC' }),
  L({ line: 1, col: 2, func: "'CUSTOMER MAINTENANCE'" }),
  L({ nameType: 'R', name: 'CONDREC', ind1: '10' }),
  L({ line: 2, col: 2, func: "'Shown when 10 is on'" }),
  L({ nameType: 'R', name: 'WIDEONLY', sizeCondition: '*DS4' }),
  L({ line: 3, col: 2, func: "'Only on the wide screen'" }),
  L({ nameType: 'R', name: 'POPUP' }),
  L({ func: 'WINDOW(5 10 6 30)' }),
  L({ line: 1, col: 2, func: "'In a window'" }),
  L({ nameType: 'R', name: 'EMPTYREC' }),
].join('\n') + '\n';
const model = DspfParser.parseDspf(SOURCE);
const opts = (over) => Object.assign({ engine: DspfEngine, memberName: 'CUSTMNT.dspf', themeName: 'green', ruler: false, textStyle: 'unicode' }, over || {});
const rej = async (fn) => { try { await fn(); return null; } catch (e) { return e; } };

/** A fake folder: records every call, can fail or be slow. */
function fakeApi(over) {
  const o = Object.assign({ failOn: null, sync: false }, over || {});
  const log = { dirs: [], files: [], order: [] };
  return {
    log,
    createDirectory: (f) => { log.dirs.push(f); log.order.push('dir'); return o.sync ? undefined : Promise.resolve(); },
    writeFile: (folder, name, text) => {
      if (o.failOn && o.failOn(name)) return o.sync ? (() => { throw new Error('disk full'); })() : Promise.reject(new Error('disk full'));
      log.files.push({ folder, name, text });
      log.order.push(name);
      return o.sync ? undefined : Promise.resolve();
    },
  };
}
const byName = (log) => Object.fromEntries(log.files.map((f) => [f.name, f.text]));

async function main() {
  // ---- A. planning --------------------------------------------------------------------------------------------------
  console.log('A: planning');
  {
    const plan = B.prepare(model, opts());
    check('A1 two display sizes are found (24x80 *DS3, 27x132 *DS4)', plan.sizes.length === 2 && plan.sizes[0].lines === 24 && plan.sizes[0].columns === 80 && plan.sizes[1].lines === 27 && plan.sizes[1].columns === 132 && plan.sizes[1].name === '*DS4');
    check('A2 one entry per record and size', plan.entries.length === model.records.length * 2 && model.records.length === 5);
    const hdr = plan.entries.filter((e) => e.record === 'HDRREC');
    check('A3 files are RECORD-LINESxCOLUMNS with .svg, .html, .txt', hdr[0].base === 'HDRREC-24x80' && hdr[1].base === 'HDRREC-27x132' && hdr[0].files.join(',') === 'HDRREC-24x80.svg,HDRREC-24x80.html,HDRREC-24x80.txt');
    check('A4 the folder is MEMBER-screens, without the extension', plan.folder === 'CUSTMNT-screens' && B.folderName('lib/QDDSSRC/MY MENU.MNUDDS') === 'MY_MENU-screens' && B.folderName('') === 'display-file-screens' && B.folderName('a.b.c.dspf') === 'a.b.c-screens');
    check('A5 the total is three files per drawn screen plus the index', plan.total === plan.entries.filter((e) => e.status === 'ok').length * 3 + 1);
    check('A6 safePart removes path characters, reserved device names, control characters and an empty result', B.safePart('a/b:c') === 'a_b_c' && B.safePart('CON') === 'CON_' && B.safePart('x\u0001y') === 'xy' && B.safePart('') === 'screen' && B.safePart('..') === 'screen' && B.safePart('A$#@_1') === 'A$#@_1');
    const dup = DspfParser.parseDspf([L({ nameType: 'R', name: 'ABC' }), L({ nameType: 'R', name: 'abc' }), L({ nameType: 'R', name: 'index' })].join('\n') + '\n');
    const dp = B.prepare(dup, opts());
    const bases = dp.entries.map((e) => e.base.toLowerCase());
    check('A7 names that differ only by case never collide (Windows, macOS)', new Set(bases).size === bases.length && bases.includes('abc-24x80') && bases.includes('abc-24x80-2'));
    check('A8 a record called index cannot overwrite index.html', dp.entries.every((e) => !e.files.some((f) => f.toLowerCase() === 'index.html')));
    check('A9 a file with no DSPSIZ is one 24x80 size', B.prepare(dup, opts()).sizes.length === 1 && B.prepare(dup, opts()).sizes[0].columns === 80);
    check('A10 no engine is a TypeError', (await rej(() => B.prepare(model, { memberName: 'x' }))) instanceof TypeError);
    check('A11 a model that is not a parsed file is a TypeError', (await rej(() => B.prepare({}, opts()))) instanceof TypeError);
    const big = { fileKeywords: [], records: Array.from({ length: B.MAX_ENTRIES + 1 }, (_, i) => ({ name: 'R' + i, keywords: [], fields: [], conditions: [] })) };
    check('A12 more screens than the cap is a RangeError before anything is built', (await rej(() => B.prepare(big, { engine: { availableScreenSizes: () => [{ lines: 24, columns: 80, name: null }], resolveScreen: () => ({}) }, memberName: 'x' }))) instanceof RangeError);
    check('A13 theme names map to their accent, anything else to the classic green', B.themeFor('amber').accent === '#ffb347' && B.themeFor('CYAN').accent === '#33d9ff' && B.themeFor('nope').accent === '#33ff66' && B.themeFor(undefined).accent === '#33ff66');
    check('A14 nothing is written while planning (entries only render when asked)', plan.entries.filter((e) => e.status === 'ok').every((e) => typeof e.render === 'function'));
  }

  // ---- B. records ---------------------------------------------------------------------------------------------------
  console.log('B: records');
  {
    const plan = B.prepare(model, opts());
    const get = (r, cols) => plan.entries.find((e) => e.record === r && e.size.columns === cols);
    check('B1 a plain record is drawn at both sizes with every indicator off', get('HDRREC', 80).status === 'ok' && get('HDRREC', 132).status === 'ok' && get('HDRREC', 80).indicators.length === 0);
    check('B2 a record with its own indicator condition is drawn with that indicator on, and says so', get('CONDREC', 80).status === 'ok' && get('CONDREC', 80).indicators.join(',') === '10');
    check('B3 a record shown only at *DS4 is skipped at 24x80 with a reason, and drawn at 27x132', get('WIDEONLY', 80).status === 'skipped' && /not shown at this display size/.test(get('WIDEONLY', 80).reason) && get('WIDEONLY', 132).status === 'ok');
    check('B4 a skipped screen has no files and no render', get('WIDEONLY', 80).files.length === 0 && !get('WIDEONLY', 80).render);
    check('B5 record kinds are named (window, plain record)', get('POPUP', 80).kind === 'Window' && get('HDRREC', 80).kind === 'Record');
    check('B6 a record with no fields is exported and marked empty', get('EMPTYREC', 80).status === 'ok' && get('EMPTYREC', 80).empty === true && get('HDRREC', 80).empty === false);
    const kinds = DspfParser.parseDspf([
      L({ nameType: 'R', name: 'PD1' }), L({ func: 'PULLDOWN' }),
      L({ nameType: 'R', name: 'SFLR' }), L({ func: 'SFL' }),
      L({ nameType: 'R', name: 'SFLC' }), L({ func: 'SFLCTL(SFLR)' }),
    ].join('\n') + '\n');
    const kp = B.prepare(kinds, opts());
    check('B7 pull-down, subfile and subfile control records are named as such', kp.entries.map((e) => e.kind).join(',') === 'Pull-down,Subfile,Subfile control');
    const negated = DspfParser.parseDspf([L({ nameType: 'R', name: 'ONLYOFF', ind1: 'N10' }), L({ line: 1, col: 2, func: "'off only'" })].join('\n') + '\n');
    const np = B.prepare(negated, opts());
    check('B8 a record shown when an indicator is OFF is drawn with all indicators off, and needs no indicator on', np.entries[0].status === 'ok' && np.entries[0].indicators.length === 0);
  }

  // ---- C. the files --------------------------------------------------------------------------------------------------
  console.log('C: the files');
  {
    const plan = B.prepare(model, opts({ themeName: 'amber', ruler: true, textStyle: 'ascii' }));
    const e = plan.entries.find((x) => x.record === 'HDRREC' && x.size.columns === 80);
    const files = e.render();
    check('C1 an entry renders its three files, in svg, html, txt order', files.map((f) => f.name).join(',') === e.files.join(','));
    const screen = DspfEngine.resolveScreen(model, 'HDRREC', new Set(), null, false, 0);
    const theme = { accent: '#ffb347' };
    check('C2 the SVG is exactly the E5b drawing of that screen (amber, ruler, titled)', files[0].content === X.buildSvg(screen, { theme, ruler: true, title: 'HDRREC (24 x 80)' }));
    check('C3 the HTML is exactly the E5b page of that screen', files[1].content === X.buildHtml(screen, { theme, ruler: true, title: 'HDRREC (24 x 80)' }));
    check('C4 the text is exactly the E5d dump with a header, the ruler and ascii borders', files[2].content === T.buildText(screen, { ruler: true, ascii: true, header: true, title: 'HDRREC (24 x 80)' }) && /^Screen preview: HDRREC \(24 x 80\)/.test(files[2].content));
    check('C5 the amber accent is in the picture', /#ffb347/i.test(files[0].content) && !/#33ff66/i.test(files[0].content));
    const wide = plan.entries.find((x) => x.record === 'HDRREC' && x.size.columns === 132).render();
    check('C6 the 132-column picture is wider than the 80-column one', parseFloat(wide[0].content.match(/width="(\d+)/)[1]) > parseFloat(files[0].content.match(/width="(\d+)/)[1]));
    const plain = B.prepare(model, opts()).entries[0].render();
    check('C7 with the defaults there is no ruler and the classic green', !/1234567890/.test(plain[2].content) && /#33ff66/i.test(plain[0].content));
    const cond = B.prepare(model, opts()).entries.find((x) => x.record === 'CONDREC' && x.size.columns === 80).render();
    check('C8 a record drawn with its own indicator on shows its text', /Shown when 10 is on/.test(cond[2].content));
    check('C9 no file holds a script or a remote address', B.prepare(model, opts()).entries.filter((x) => x.render).every((x) => x.render().every((f) => !/<script|https?:\/\/(?!www\.w3\.org)/i.test(f.content))));
    const win = B.prepare(model, opts()).entries.find((x) => x.record === 'POPUP' && x.size.columns === 80).render();
    check('C10 a window record is drawn (its text is in the dump)', /In.a.window/.test(win[2].content));
  }

  // ---- D. the index page ---------------------------------------------------------------------------------------------
  console.log('D: the index page');
  {
    const plan = B.prepare(model, opts({ ruler: true }));
    const html = B.buildIndex(plan);
    check('D1 a standalone page: doctype, utf-8, a title naming the member', /^<!doctype html>/i.test(html) && /<meta charset="utf-8">/.test(html) && /<title>Screen previews: CUSTMNT\.dspf<\/title>/.test(html));
    check('D2 every record is a heading', model.records.every((r) => html.includes('<h2>' + r.name + '<span class="kind">')));
    const hrefs = Array.from(html.matchAll(/(?:href|src)="([^"]+)"/g)).map((m) => m[1]);
    const allFiles = new Set(plan.entries.flatMap((e) => e.files));
    check('D3 every link and picture points to a file the batch writes', hrefs.length > 0 && hrefs.every((h) => allFiles.has(h)));
    check('D4 every written file is linked (SVG as the picture, HTML as its link, all three in the caption)', Array.from(allFiles).every((f) => hrefs.includes(f)));
    check('D5 a screen not shown at a size is listed with its reason and no link', /24 x 80 \(\*DS3\): not exported - not shown at this display size/.test(html) && !hrefs.some((h) => h.startsWith('WIDEONLY-24x80')));
    check('D6 the indicator a record was drawn with is stated', /Drawn with indicator 10 on/.test(html));
    check('D7 the empty record is noted', /no fields of its own/.test(html));
    check('D8 the summary counts screens, records and sizes, and mentions the ruler', /<p class="sub">\d+ screens? from 5 records, 2 display sizes, every indicator off, with the ruler\.<\/p>/.test(html));
    check('D9 no script and no remote file', !/<script|https?:\/\//i.test(html));
    const evil = B.buildIndex(B.prepare(model, opts({ memberName: '<img src=x onerror=1>&"q".dspf' })));
    check('D10 a hostile member name is escaped everywhere', !/<img src=x/.test(evil) && /&lt;img src=x onerror=1&gt;&amp;&quot;q&quot;/.test(evil));
    const partial = B.buildIndex(plan, { written: ['HDRREC-24x80.svg', 'HDRREC-24x80.txt'] });
    check('D11 a file that was not written is not linked, and the screen says so', !/href="HDRREC-24x80\.html"/.test(partial) && /href="HDRREC-24x80\.txt"/.test(partial) && /CONDREC/.test(partial) && /no file was written/.test(partial));
    const one = B.buildIndex(B.prepare(DspfParser.parseDspf([L({ nameType: 'R', name: 'A' }), L({ line: 1, col: 1, func: "'x'" })].join('\n') + '\n'), opts()));
    check('D12 singular wording for one screen, one record, one size', /1 screen from 1 record, 1 display size, every indicator off\./.test(one));
  }

  // ---- E. running ----------------------------------------------------------------------------------------------------
  console.log('E: running');
  {
    const plan = B.prepare(model, opts());
    const api = fakeApi();
    const progress = [];
    const res = await B.run(plan, api, { onProgress: (d, t, l) => progress.push([d, t, l]) });
    const names = api.log.files.map((f) => f.name);
    check('E1 the folder is created first, once', api.log.order[0] === 'dir' && api.log.dirs.length === 1 && api.log.dirs[0] === 'CUSTMNT-screens');
    check('E2 every file is written into that folder, and the index last', api.log.files.every((f) => f.folder === 'CUSTMNT-screens') && names[names.length - 1] === 'index.html' && names.length === plan.total);
    check('E3 the result counts match', res.written.length === plan.total && res.failed.length === 0 && res.cancelled === false && res.indexWritten === true && res.skipped === 1 && res.folder === 'CUSTMNT-screens');
    check('E4 progress runs from 1 to the total, one step per file', progress.length === plan.total && progress[0][0] === 1 && progress[progress.length - 1][0] === plan.total && progress.every((p) => p[1] === plan.total) && progress[progress.length - 1][2] === 'index.html');
    check('E5 the index written is the one for what was written (links resolve)', (() => { const idx = byName(api.log)['index.html']; const links = Array.from(idx.matchAll(/(?:href|src)="([^"]+)"/g)).map((m) => m[1]); return links.every((l) => names.includes(l)); })());

    // cancel after the first screen (three files)
    const api2 = fakeApi();
    let calls = 0;
    const r2 = await B.run(plan, api2, { isCancelled: () => ++calls > 2, onProgress: () => {} });
    check('E6 a cancel stops between screens: whole screens only, no index, cancelled reported', r2.cancelled === true && r2.indexWritten === false && r2.written.length % 3 === 0 && r2.written.length > 0 && r2.written.length < plan.total - 1 && !api2.log.files.some((f) => f.name === 'index.html'));
    const api3 = fakeApi();
    const r3 = await B.run(plan, api3, { isCancelled: () => true });
    check('E7 cancelled before the first screen writes nothing but the folder', r3.cancelled === true && r3.written.length === 0 && api3.log.dirs.length === 1);

    // failures
    const api4 = fakeApi({ failOn: (n) => n === 'HDRREC-24x80.html' });
    const r4 = await B.run(plan, api4, {});
    check('E8 a file that cannot be written is recorded and the batch goes on', r4.failed.length === 1 && r4.failed[0].name === 'HDRREC-24x80.html' && /disk full/.test(r4.failed[0].error) && r4.written.length === plan.total - 1 && r4.indexWritten === true);
    check('E9 and the index does not link the file that is missing', !/href="HDRREC-24x80\.html"/.test(byName(api4.log)['index.html']));
    const api5 = fakeApi({ failOn: (n) => n === 'index.html' });
    const r5 = await B.run(plan, api5, {});
    check('E10 a failed index is reported, not claimed as written', r5.indexWritten === false && r5.failed.some((f) => f.name === 'index.html'));
    const api6 = fakeApi({ sync: true });
    const r6 = await B.run(plan, api6, {});
    check('E11 synchronous file calls work too', r6.written.length === plan.total && r6.indexWritten);
    const api7 = fakeApi({ sync: true, failOn: (n) => n.endsWith('.txt') });
    const r7 = await B.run(plan, api7, {});
    check('E12 a synchronous throw is recorded the same way', r7.failed.length > 0 && r7.failed.every((f) => f.name.endsWith('.txt')));
    const broken = B.prepare(model, opts());
    const victim = broken.entries.find((e) => e.render);
    victim.render = () => { throw new Error('render blew up'); };
    const api8 = fakeApi();
    const r8 = await B.run(broken, api8, {});
    check('E13 a screen that cannot be rendered is recorded for its three files, the rest are written', r8.failed.length === 3 && /render blew up/.test(r8.failed[0].error) && r8.written.length === broken.total - 3 && r8.indexWritten);
    const noDir = await rej(() => B.run(plan, { createDirectory: () => Promise.reject(new Error('no permission')), writeFile: () => {} }, {}));
    check('E14 a folder that cannot be created rejects with its own error', noDir && /no permission/.test(noDir.message));
    const empty = B.prepare(DspfParser.parseDspf('\n'), opts());
    const r9 = await B.run(empty, fakeApi(), {});
    check('E15 a file with no records plans nothing (the command refuses it before this)', empty.entries.length === 0 && r9.written.length === 1);
  }

  // ---- F. the command on the vscode mock -------------------------------------------------------------------------------
  console.log('F: the command');
  {
    const context = vscodeMock.__mockExtensionContext();
    ext.activate(context);
    const cmd = vscodeMock.__registeredCommands['dspfDesigner.exportAllScreenPreviews'];
    check('F1 the command is registered', typeof cmd === 'function');
    vscodeMock.__lastWarning = undefined;
    await cmd();
    check('F2 no designer open: a warning that says what to do', /Open a display file or a menu in the iSDA designer first, then export its screen previews/.test(vscodeMock.__lastWarning || ''));

    function makePanel() {
      const state = { handler: null, disposed: null, html: null, posted: [] };
      const panel = {
        active: true, visible: true,
        webview: {
          cspSource: 'x', options: null,
          set html(v) { state.html = v; }, get html() { return state.html; },
          onDidReceiveMessage: (h) => { state.handler = h; return { dispose: () => {} }; },
          postMessage: (m) => { state.posted.push(m); return Promise.resolve(true); },
        },
        onDidDispose: (h) => { state.disposed = h; return { dispose: () => {} }; },
      };
      return { panel, state };
    }
    const dspfEntry = vscodeMock.__registeredCustomEditorProviders['dspfDesigner.editor'];
    const doc = vscodeMock.__mockDocument(SOURCE, new vscodeMock.Uri('file', '/work/proj/CUSTMNT.dspf'));
    const a = makePanel();
    await dspfEntry.provider.resolveCustomTextEditor(doc, a.panel, {});

    const written = {};
    const origWrite = vscodeMock.workspace.fs.writeFile;
    vscodeMock.workspace.fs.writeFile = (uri, bytes) => { written[uri.path] = Buffer.from(bytes).toString('utf8'); return Promise.resolve(); };
    vscodeMock.__clearMockDirs();
    vscodeMock.__clearMockConfig();

    // a cancelled picker
    vscodeMock.__setOpenDialogResponse(undefined);
    vscodeMock.__lastInformation = undefined;
    await cmd();
    check('F3 the folder picker opens in the member\'s folder and offers folders only', !!vscodeMock.__lastOpenDialog && vscodeMock.__lastOpenDialog.canSelectFolders === true && vscodeMock.__lastOpenDialog.canSelectFiles === false && vscodeMock.__lastOpenDialog.canSelectMany === false && vscodeMock.__lastOpenDialog.defaultUri.path === '/work/proj' && /CUSTMNT-screens/.test(vscodeMock.__lastOpenDialog.title));
    check('F4 a cancelled picker writes nothing and says nothing', Object.keys(written).length === 0 && vscodeMock.__lastInformation === undefined);

    // the happy path, amber theme, ruler on
    await context.globalState.update('isda.uiTheme', 'amber');
    vscodeMock.__setMockConfig('isda.export.ruler', true);
    vscodeMock.__setOpenDialogResponse([new vscodeMock.Uri('file', '/out')]);
    vscodeMock.__lastInformation = undefined;
    const infoPromise = cmd();
    await infoPromise;
    const paths = Object.keys(written);
    check('F5 every file goes into /out/CUSTMNT-screens, three per drawn screen plus the index', paths.length === 28 && paths.every((p) => p.startsWith('/out/CUSTMNT-screens/')) && paths.includes('/out/CUSTMNT-screens/index.html') && paths.includes('/out/CUSTMNT-screens/HDRREC-24x80.svg') && paths.includes('/out/CUSTMNT-screens/WIDEONLY-27x132.txt'));
    check('F6 a skipped screen has no files', !paths.some((p) => p.includes('WIDEONLY-24x80')));
    check('F7 the UI theme and the ruler setting reach the files', /#ffb347/i.test(written['/out/CUSTMNT-screens/HDRREC-24x80.svg']) && /1234567890/.test(written['/out/CUSTMNT-screens/HDRREC-24x80.txt']));
    check('F8 the index is the real index of what was written', /<title>Screen previews: CUSTMNT\.dspf<\/title>/.test(written['/out/CUSTMNT-screens/index.html']) && /HDRREC-24x80\.svg/.test(written['/out/CUSTMNT-screens/index.html']));
    check('F9 the end message counts the screens, names the folder and mentions the skipped one', /Exported 9 screens to CUSTMNT-screens\./.test(vscodeMock.__lastInformation || '') && /1 not shown at their size/.test(vscodeMock.__lastInformation || ''));
    check('F10 no PNG is written', !paths.some((p) => /\.png$/i.test(p)));
    const unsavedBefore = written['/out/CUSTMNT-screens/HDRREC-24x80.txt'];

    // the folder now exists: ask before replacing
    Object.keys(written).forEach((k) => delete written[k]);
    vscodeMock.__setWarningResponse(undefined);
    vscodeMock.__lastWarning = undefined;
    await cmd();
    check('F11 an existing folder asks first, modally, and declining writes nothing', /CUSTMNT-screens already exists/.test(vscodeMock.__lastWarning || '') && Object.keys(written).length === 0);
    vscodeMock.__setWarningResponse('Replace');
    await cmd();
    check('F12 and accepting replaces the files', Object.keys(written).length === 28 && written['/out/CUSTMNT-screens/HDRREC-24x80.txt'] === unsavedBefore);
    vscodeMock.__setWarningResponse(undefined);

    // the text of the document, not the saved file, is what is exported
    const doc2 = vscodeMock.__mockDocument(L({ nameType: 'R', name: 'ONLYREC' }) + '\n' + L({ line: 1, col: 2, func: "'fresh from the editor'" }) + '\n', new vscodeMock.Uri('file', '/work/proj/OTHER.dspf'));
    const b = makePanel();
    await dspfEntry.provider.resolveCustomTextEditor(doc2, b.panel, {});
    a.panel.active = false;
    vscodeMock.__clearMockDirs();
    Object.keys(written).forEach((k) => delete written[k]);
    await cmd();
    check('F13 the active designer\'s own text is exported, into its own folder name', Object.keys(written).every((p) => p.startsWith('/out/OTHER-screens/')) && /fresh from the editor/.test(written['/out/OTHER-screens/ONLYREC-24x80.txt'] || '') && Object.keys(written).length === 4);
    b.state.disposed();
    a.panel.active = true;

    // cancelling from the progress notification
    vscodeMock.__clearMockDirs();
    Object.keys(written).forEach((k) => delete written[k]);
    const origProgress = vscodeMock.window.withProgress;
    vscodeMock.window.withProgress = (o, task) => { let n = 0; return task({ report: () => { n++; } }, { get isCancellationRequested() { return n >= 4; } }); };
    vscodeMock.__lastWarning = undefined;
    await cmd();
    check('F14 cancelling the notification stops after whole screens, makes no index, and says how many files were written', /Export cancelled\. \d+ files were written to CUSTMNT-screens; no index page was made/.test(vscodeMock.__lastWarning || '') && !('/out/CUSTMNT-screens/index.html' in written) && Object.keys(written).length >= 3 && Object.keys(written).length < 27);
    vscodeMock.window.withProgress = origProgress;

    // a failing write
    vscodeMock.__clearMockDirs();
    Object.keys(written).forEach((k) => delete written[k]);
    vscodeMock.workspace.fs.writeFile = (uri, bytes) => (/HDRREC-24x80\.svg$/.test(uri.path) ? Promise.reject(new Error('read-only folder')) : (written[uri.path] = Buffer.from(bytes).toString('utf8'), Promise.resolve()));
    vscodeMock.__lastError = undefined;
    await cmd();
    check('F16 a file that cannot be written is an error message naming it, and the rest are written', /1 file could not be written to CUSTMNT-screens \(first: HDRREC-24x80\.svg: read-only folder\)/.test(vscodeMock.__lastError || '') && Object.keys(written).length === 27);
    vscodeMock.workspace.fs.writeFile = origWrite;

    // an IBM i member offers the workspace folder
    const memberDoc = vscodeMock.__mockDocument(SOURCE, new vscodeMock.Uri('member', '/MYLIB/QDDSSRC/CUSTMNT.DSPF'));
    const m = makePanel();
    await dspfEntry.provider.resolveCustomTextEditor(memberDoc, m.panel, {});
    a.panel.active = false;
    vscodeMock.__setOpenDialogResponse(undefined);
    await cmd();
    check('F17 an IBM i member offers the workspace folder in the picker', vscodeMock.__lastOpenDialog.defaultUri.path === '/workspace');
    m.state.disposed(); a.state.disposed();
    vscodeMock.__clearMockConfig();
    vscodeMock.__clearMockDirs();
  }

  // ---- G. package.json and the module ----------------------------------------------------------------------------------
  console.log('G: package.json');
  {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf8'));
    const command = pkg.contributes.commands.find((c) => c.command === 'dspfDesigner.exportAllScreenPreviews');
    check('G1 the command is contributed with its title', !!command && command.title === 'iSDA: Export All Screen Previews');
    check('G2 screenBatch.js is in the dist copy list', /'screenBatch\.js'/.test(pkg.scripts['build:webview-assets']));
    const src = fs.readFileSync(path.join(__dirname, '../screenBatch.js'), 'utf8');
    check('G3 no vscode import and no remote URL in the module', !/require\(['"]vscode['"]\)/.test(src) && !/https?:\/\//.test(src.replace(/\/\*[\s\S]*?\*\//g, '')));
    check('G4 the dist copy equals the source', fs.readFileSync(path.join(__dirname, '../../dist/screenBatch.js'), 'utf8') === src);
    check('G5 the batch writes no PNG (the module never names the PNG module)', !/screenPng/i.test(src.replace(/\/\*[\s\S]*?\*\//g, '')));
  }
}

main().then(() => process.exit(failureCount() === 0 ? 0 : 1), (err) => { console.log('FAIL  - unexpected error:', err && err.stack || err); process.exit(1); });

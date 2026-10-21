/**
 * e5eExportUi.test.js
 *
 * E5e - the command, toolbar button, save dialog and clipboard for the screen preview export (src/screenExportUi.js, the wiring in
 * extension.ts and in both designer templates).
 *   A. settings and names: the four isda.export.* settings checked, file names per format, the Export controls' markup.
 *   B. building: each format from a real resolved screen (SVG, HTML, text, PNG through a fake canvas), the ruler and text style
 *      settings, a screen with an error, the member name put in front of the record name.
 *   C. the webview controller (fake page): default-format save, "More..." list, PNG copy and its fallback to a save, the busy guard,
 *      errors, settings and the host's request.
 *   D. the host half: message checks, save dialog and write (text and PNG), clipboard, cancel, failed write.
 *   E. the DSPF designer page (jsdom): two copies of the controls, the button saves what the preview shows now, indicators, settings.
 *   F. the menu designer page (jsdom): the same on the menu's own screen.
 *   G. the extension host against the vscode mock: settings pushed on ready and on a change, the save and copy messages, the command
 *      on the active designer, no designer open, the registry on dispose.
 *   H. package.json: the four settings and the command, consistent with the module; the module is in the dist copy list.
 *
 * Run with: node src/test/e5eExportUi.test.js   (needs `npm run compile`)
 */
'use strict';
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');
const Module = require('module');

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'vscode') return require('./vscode-mock.js');
  return originalLoad.apply(this, arguments);
};

const vscodeMock = require('./vscode-mock.js');
const { check, failureCount } = require('./helpers/harness');
const { newWebviewDom, webviewHtml, menuWebviewHtml } = require('./helpers/common');
const U = require(path.join(__dirname, '../../dist/screenExportUi.js'));
const X = require(path.join(__dirname, '../../dist/screenExport.js'));
const P = require(path.join(__dirname, '../../dist/screenPng.js'));
const DspfEngine = require(path.join(__dirname, '../../dist/dspfEngine.js'));
const DspfParser = require(path.join(__dirname, '../../dist/dspfParser.js'));
const ext = require(path.join(__dirname, '../../dist/extension.js'));

// ---- a real PNG without a canvas (grey, w x h)
function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function makePng(w, h) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8;
  const row = Buffer.alloc(w + 1);
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// ---- a fake browser for the canvas (the same idea as E5c's test): every picture comes out as a PNG of the size asked for
function fakeImageEnv() {
  const log = { canvases: [] };
  class FakeImage { set src(v) { setTimeout(() => { if (this.onload) this.onload(); }, 0); } }
  const document = {
    createElement() {
      const canvas = {
        width: 0, height: 0,
        getContext: () => ({ drawImage() {} }),
        toDataURL() { log.canvases.push({ w: canvas.width, h: canvas.height }); return 'data:image/png;base64,' + makePng(canvas.width, canvas.height).toString('base64'); },
      };
      return canvas;
    },
  };
  return { env: { document, Image: FakeImage }, log };
}

const SOURCE = [
  '     A                                      DSPSIZ(24 80 *DS3)',
  '     A                                      INDARA',
  '     A          R HDRREC',
  "     A                                  1  2'CUSTOMER MAINTENANCE'",
  "     A  10                              3  2'Indicator ten is on'",
  "     A N10                              3 30'Indicator ten is off'",
  '     A            NAME      10A  B  5 10',
  '     A          R MENU1',
  "     A                                  2  2'Second record'",
].join('\n') + '\n';

const model = DspfParser.parseDspf(SOURCE);
// the serialiser writes a blank inside a text run as a non-breaking space (an XML character reference), so a search for words needs it undone
const plain = (t) => String(t).replace(/&#160;|&nbsp;|\u00a0/g, ' ');
const screenFor = (record, ind) => DspfEngine.resolveScreen(model, record, ind || new Set());

async function main() {
  // ---- A. settings and names ----------------------------------------------------------------------------------------
  console.log('A: settings and names');
  {
    const d = U.readSettings();
    check('A1 defaults: png, 2x, no ruler, unicode', d.defaultFormat === 'png' && d.pngScale === 2 && d.ruler === false && d.textStyle === 'unicode');
    const s = U.readSettings((k, f) => ({ defaultFormat: 'svg', pngScale: 3, ruler: true, textStyle: 'ascii' })[k] === undefined ? f : ({ defaultFormat: 'svg', pngScale: 3, ruler: true, textStyle: 'ascii' })[k]);
    check('A2 every setting is read', s.defaultFormat === 'svg' && s.pngScale === 3 && s.ruler === true && s.textStyle === 'ascii');
    const bad = U.readSettings((k) => ({ defaultFormat: 'gif', pngScale: 7, ruler: 'yes', textStyle: 'fancy' })[k]);
    check('A3 a value that is not one of the choices falls back to its default (a ruler must be a real true)', bad.defaultFormat === 'png' && bad.pngScale === 2 && bad.ruler === false && bad.textStyle === 'unicode');
    check('A4 a string scale such as "3" is read as 3, "2x" is not a setting value', U.readSettings((k) => (k === 'pngScale' ? '3' : undefined)).pngScale === 3 && U.readSettings((k) => (k === 'pngScale' ? '2x' : undefined)).pngScale === 2);
    check('A5 file names per format', U.suggestFileName('HDRREC', 'svg', 1) === 'HDRREC.svg' && U.suggestFileName('HDRREC', 'html', 1) === 'HDRREC.html' && U.suggestFileName('HDRREC', 'text', 1) === 'HDRREC.txt' && U.suggestFileName('HDRREC', 'png', 2) === 'HDRREC@2x.png');
    check('A6 a name is made safe (path characters, device names, an empty name, a leftover extension)', U.suggestFileName('a/b:c', 'svg', 1) === 'a_b_c.svg' && U.suggestFileName('CON', 'text', 1) === 'CON_.txt' && U.suggestFileName('', 'html', 1) === 'screen.html' && U.suggestFileName('x.svg', 'svg', 1) === 'x.svg' && U.suggestFileName(null, 'text', 1) === 'screen.txt');
    const html = U.controlsHtml('aside');
    check('A7 the controls: a button and a list with every format to save and to copy', /id="asideExportBtn"/.test(html) && /id="asideExportMore"/.test(html) && ['save:png', 'save:svg', 'save:html', 'save:text', 'copy:png', 'copy:svg', 'copy:html', 'copy:text'].every((v) => html.includes('value="' + v + '"')));
    check('A8 the prefix makes the ids unique', U.controlsHtml('toolbar').includes('id="toolbarExportBtn"') && U.controlsHtml('').includes('id="ExportBtn"'));
    check('A9 the markup has no backtick or script', !/[`]|<script/i.test(html));
  }

  // ---- B. building --------------------------------------------------------------------------------------------------
  console.log('B: building');
  {
    const s = screenFor('HDRREC');
    const svg = await U.buildArtifact(s, { format: 'svg', name: 'CUST-HDRREC' });
    check('B1 SVG is the E5b drawing, with the name as its title', svg.format === 'svg' && svg.mime === 'image/svg+xml' && svg.text.includes('<svg'));
    check('B2 the SVG draws the record', /CUSTOMER MAINTENANCE/.test(plain(svg.text)) && svg.text.includes('CUST-HDRREC'));
    const html = await U.buildArtifact(s, { format: 'html' });
    check('B3 HTML is a standalone page (doctype, no script, no remote file)', /^<!doctype html>/i.test(html.text) && !/<script|https?:\/\/(?!www\.w3\.org)/i.test(html.text));
    const txt = await U.buildArtifact(s, { format: 'text', name: 'HDRREC' });
    check('B4 text has the header and the screen', txt.mime === 'text/plain' && /^Screen preview: HDRREC \(24 x 80\)/.test(txt.text) && /CUSTOMER MAINTENANCE/.test(txt.text));
    const ruled = await U.buildArtifact(s, { format: 'text', settings: { ruler: true } });
    check('B5 the ruler setting adds the numbers to text', /1234567890/.test(ruled.text) && !/1234567890/.test(txt.text));
    const svgRuled = await U.buildArtifact(s, { format: 'svg', settings: { ruler: true } });
    check('B6 the ruler setting adds the numbers to the picture', svgRuled.text.length > svg.text.length);
    const win = screenFor('HDRREC');
    win.windows = [{ record: 'W', line: 3, column: 5, height: 4, width: 20, title: 'T', borderChars: null }];
    const unicode = await U.buildArtifact(win, { format: 'text' });
    const ascii = await U.buildArtifact(win, { format: 'text', settings: { textStyle: 'ascii' } });
    check('B7 the text style setting picks the border characters', ascii.text !== unicode.text || !/[─-╿]/.test(ascii.text));
    check('B8 the ascii style has no box-drawing characters', !/[─-╿]/.test(ascii.text));
    const dark = await U.buildArtifact(s, { format: 'svg', theme: { accent: '#ffb000' } });
    check('B9 the page theme reaches the picture (an amber accent)', /#ffb000/i.test(dark.text));
    const hostile = await U.buildArtifact(s, { format: 'svg', theme: { accent: '"><script>alert(1)</script>' } });
    check('B10 a hostile theme value never puts markup into the file', !/<script/i.test(hostile.text));
    const on = await U.buildArtifact(screenFor('HDRREC', new Set(['10'])), { format: 'text' });
    const off = await U.buildArtifact(screenFor('HDRREC'), { format: 'text' });
    check('B11 the export is of the indicator state the screen was resolved under', /Indicator ten is on/.test(on.text) && !/Indicator ten is off/.test(on.text) && /Indicator ten is off/.test(off.text));
    const fake = fakeImageEnv();
    const png = await U.buildArtifact(s, { format: 'png', name: 'HDRREC', settings: { pngScale: 3 }, env: fake.env });
    check('B12 PNG is rasterised at the scale setting and comes as an exportPng message', png.format === 'png' && png.png && png.png.type === 'exportPng' && png.png.scale === 3 && fake.log.canvases.length === 1);
    const size = X.buildSvg(s, {}).match(/width="(\d+(?:\.\d+)?)"/);
    check('B13 the canvas is the drawing size times the scale', !!size && fake.log.canvases[0].w === Math.round(parseFloat(size[1]) * 3));
    const rej = async (fn) => { try { await fn(); return null; } catch (e) { return e; } };
    check('B14 no screen is refused with a message', /Nothing to export/.test((await rej(() => U.buildArtifact(null, {}))).message));
    check('B15 a screen with an error is refused with its reason', /Nothing to export: Record not found/.test((await rej(() => U.buildArtifact({ error: 'Record not found' }, {}))).message));
    const unknown = await U.buildArtifact(s, { format: 'gif', env: fakeImageEnv().env });
    check('B16 an unknown format falls back to PNG rather than writing nothing', unknown.format === 'png' && !!unknown.png);
    const m = U.withFileBase({ type: 'exportScreen', name: 'HDRREC', png: { name: 'HDRREC' } }, 'CUSTMNT.dspf');
    check('B17 the member name goes in front of the record name, in the message and its PNG part', m.name === 'CUSTMNT-HDRREC' && m.png.name === 'CUSTMNT-HDRREC');
    check('B18 withFileBase returns a copy and leaves the original alone', (() => { const o = { name: 'A' }; const c = U.withFileBase(o, 'B.x'); return o.name === 'A' && c.name === 'B-A'; })());
    check('B19 with no record name the member name stands alone, with no base the record name does', U.withFileBase({ name: '' }, 'M.DSPF').name === 'M' && U.withFileBase({ name: 'R' }, '').name === 'R');
  }

  // ---- C. the controller on a fake page ------------------------------------------------------------------------------
  console.log('C: the webview controller');
  {
    function fakePage(over) {
      const handlers = {};
      const nodes = {};
      const mk = (id) => {
        const n = { id, value: '', listeners: {}, addEventListener(t, f) { (n.listeners[t] = n.listeners[t] || []).push(f); } };
        nodes[id] = n; return n;
      };
      mk('aExportBtn'); mk('aExportMore');
      const posted = [];
      const env = Object.assign({
        document: { getElementById: (id) => nodes[id] || null },
        window: null,
        postMessage: (m) => posted.push(m),
        getScreen: () => screenFor('HDRREC'),
        getName: () => 'HDRREC',
        imageEnv: fakeImageEnv().env,
      }, over || {});
      return { env, nodes, posted, fire: (id, t) => Promise.all((nodes[id].listeners[t] || []).map((f) => f())) };
    }
    const settle = () => new Promise((r) => setTimeout(r, 20));

    let pg = fakePage();
    let c = U.createController(pg.env);
    c.attach('a');
    await pg.fire('aExportBtn', 'click'); await settle();
    check('C1 the button saves in the default format (png)', pg.posted.length === 1 && pg.posted[0].type === 'exportScreen' && pg.posted[0].action === 'save' && pg.posted[0].format === 'png' && pg.posted[0].png.type === 'exportPng' && pg.posted[0].name === 'HDRREC');

    pg = fakePage(); c = U.createController(pg.env); c.attach('a');
    c.applySettings({ defaultFormat: 'svg', pngScale: 1, ruler: false, textStyle: 'unicode' });
    await pg.fire('aExportBtn', 'click'); await settle();
    check('C2 a setting from the host changes the default format', pg.posted[0].format === 'svg' && typeof pg.posted[0].text === 'string' && pg.posted[0].text.includes('<svg'));

    pg.nodes.aExportMore.value = 'copy:text';
    await pg.fire('aExportMore', 'change'); await settle();
    check('C3 the list copies text: the page posts action copy with the text, and resets itself', pg.posted[1].action === 'copy' && pg.posted[1].format === 'text' && /Screen preview/.test(pg.posted[1].text) && pg.nodes.aExportMore.value === '');
    pg.nodes.aExportMore.value = 'save:html';
    await pg.fire('aExportMore', 'change'); await settle();
    check('C4 the list saves in another format', pg.posted[2].action === 'save' && pg.posted[2].format === 'html');
    pg.nodes.aExportMore.value = 'zip:text';
    await pg.fire('aExportMore', 'change'); await settle();
    pg.nodes.aExportMore.value = '';
    await pg.fire('aExportMore', 'change'); await settle();
    check('C5 an unknown action and the "More..." heading post nothing', pg.posted.length === 3);

    // PNG copy
    let written = null;
    class Item { constructor(o) { this.o = o; } }
    pg = fakePage({ clipboard: { write: (items) => { written = items; return Promise.resolve(); } }, ClipboardItem: Item, atob: (s) => Buffer.from(s, 'base64').toString('binary'), Blob: class { constructor(parts, o) { this.parts = parts; this.type = o.type; } } });
    c = U.createController(pg.env); c.attach('a');
    const r = await c.run('png', 'copy');
    check('C6 a PNG copy writes an image/png item to the clipboard and tells the host it was copied', r.action === 'copied' && written && written[0].o['image/png'].type === 'image/png' && written[0].o['image/png'].parts[0].length > 30 && pg.posted.length === 1 && pg.posted[0].action === 'copied' && pg.posted[0].format === 'png' && !pg.posted[0].png);
    pg = fakePage({ clipboard: { write: () => Promise.reject(new Error('NotAllowedError')) }, ClipboardItem: Item, atob: (s) => Buffer.from(s, 'base64').toString('binary'), Blob: class { constructor(p, o) { this.type = o.type; } } });
    c = U.createController(pg.env);
    const r2 = await c.run('png', 'copy');
    check('C7 a refused image copy becomes a save, with a note', r2.action === 'save' && pg.posted[0].action === 'save' && pg.posted[0].png && /could not copy the image/.test(pg.posted[0].notice));
    pg = fakePage({ clipboard: null, ClipboardItem: null });
    c = U.createController(pg.env);
    const savedGlobals = { nav: global.navigator, ci: global.ClipboardItem };
    const r3 = await c.run('png', 'copy');
    check('C8 no clipboard at all is the same fallback', r3.action === 'save' && /instead/.test(pg.posted[0].notice || ''));

    // errors and busy
    pg = fakePage({ getScreen: () => ({ error: 'Record not found' }) }); c = U.createController(pg.env);
    const r4 = await c.run('svg', 'save');
    check('C9 an error screen posts an error message, not an export', r4.ok === false && pg.posted.length === 1 && pg.posted[0].type === 'error' && /Record not found/.test(pg.posted[0].message));
    pg = fakePage({ getScreen: () => null }); c = U.createController(pg.env);
    await c.run('text', 'save');
    check('C10 no screen yet is an error message too', pg.posted[0].type === 'error' && /Nothing to export/.test(pg.posted[0].message));
    pg = fakePage(); c = U.createController(pg.env);
    const first = c.run('png', 'save');
    const second = await c.run('svg', 'save');
    await first; await settle();
    check('C11 a second click while a PNG is being drawn is ignored (no double save)', second.reason === 'busy' && pg.posted.length === 1);
    const third = await c.run('svg', 'save');
    check('C12 and the controller is free again afterwards', third.ok === true && pg.posted.length === 2);

    // the host's request
    pg = fakePage(); c = U.createController(pg.env);
    c.applySettings({ defaultFormat: 'text' });
    await c.handleRequest({ type: 'exportScreenRequest' }); await settle();
    check('C13 the command\'s request exports in the default format', pg.posted[0].format === 'text' && pg.posted[0].action === 'save');
    await c.handleRequest({ type: 'exportScreenRequest', format: 'svg', action: 'copy' }); await settle();
    check('C14 a request may name the format and the action', pg.posted[1].format === 'svg' && pg.posted[1].action === 'copy');
    await c.handleRequest({ type: 'exportScreenRequest', format: 'exe', action: 'run' }); await settle();
    check('C15 a request with an unknown format or action falls back to the defaults', pg.posted[2].format === 'text' && pg.posted[2].action === 'save');
    check('C16 settings from the host are checked again here', c.applySettings({ defaultFormat: 'bmp', pngScale: 9 }).defaultFormat === 'png' && c.getSettings().pngScale === 2);
    void savedGlobals;
  }

  // ---- D. the host half ----------------------------------------------------------------------------------------------
  console.log('D: the host half');
  {
    const rej = async (fn) => { try { await fn(); return null; } catch (e) { return e; } };
    check('D1 a message that is not an exportScreen is refused', !!(await rej(() => U.handleMessage({}, { type: 'x' }))));
    check('D2 an unknown format is refused', /Unknown export format/.test((await rej(() => U.handleMessage({}, { type: 'exportScreen', format: 'gif', action: 'save', text: 'x' }))).message));
    check('D3 an unknown action is refused', /Unknown export action/.test((await rej(() => U.handleMessage({}, { type: 'exportScreen', format: 'svg', action: 'burn', text: 'x' }))).message));
    check('D4 no content is refused', /no content/.test((await rej(() => U.handleMessage({}, { type: 'exportScreen', format: 'svg', action: 'save', text: '' }))).message));
    check('D5 a huge export is refused before any dialog', /too large/.test((await rej(() => U.handleMessage({ showSaveDialog: () => { throw new Error('dialog'); } }, { type: 'exportScreen', format: 'svg', action: 'save', text: 'x'.repeat(U.MAX_TEXT + 1) }))).message));
    check('D6 a bad PNG part is refused by the E5c checks', !!(await rej(() => U.handleMessage({}, { type: 'exportScreen', format: 'png', action: 'save', png: { type: 'exportPng', base64: 'AAAA' } }))));
    check('D7 only an image copy is reported as copied', !!(await rej(() => U.handleMessage({}, { type: 'exportScreen', format: 'svg', action: 'copied' }))));

    const calls = { dialog: [], write: [], clip: [] };
    const api = {
      showSaveDialog: (o) => { calls.dialog.push(o); return Promise.resolve('file:///out/' + o.defaultPath.split('/').pop()); },
      writeFile: (t, b) => { calls.write.push({ t, b }); return Promise.resolve(); },
      writeClipboardText: (t) => { calls.clip.push(t); return Promise.resolve(); },
    };
    const svgMsg = { type: 'exportScreen', format: 'svg', action: 'save', name: 'MYSCR-HDRREC', text: '<svg>é</svg>' };
    const res = await U.handleMessage(api, svgMsg, { defaultFolder: '/work/proj/' });
    check('D8 a text save asks where, with the folder, the file name and the format filter', calls.dialog[0].defaultPath === '/work/proj/MYSCR-HDRREC.svg' && calls.dialog[0].filters.SVG[0] === 'svg' && /Save SVG/.test(calls.dialog[0].saveLabel));
    check('D9 and writes the text as UTF-8', res.done === 'saved' && res.fileName === 'MYSCR-HDRREC.svg' && Buffer.isBuffer(calls.write[0].b) && calls.write[0].b.toString('utf8') === '<svg>é</svg>');
    const txtMsg = { type: 'exportScreen', format: 'text', action: 'save', name: 'A', text: 'Screen\n' };
    await U.handleMessage(api, txtMsg);
    check('D10 plain text is a .txt with the Plain text filter, and no folder means the bare name', calls.dialog[1].defaultPath === 'A.txt' && calls.dialog[1].filters['Plain text'][0] === 'txt');
    const png = makePng(40, 20);
    const pngMsg = { type: 'exportScreen', format: 'png', action: 'save', name: 'X', png: { type: 'exportPng', name: 'X', scale: 2, width: 40, height: 20, base64: png.toString('base64') } };
    const pres = await U.handleMessage(api, pngMsg, { defaultFolder: '/o' });
    check('D11 a PNG is saved as the exact bytes, named with its scale', pres.fileName === 'X@2x.png' && Buffer.compare(calls.write[2].b, png) === 0 && calls.dialog[2].defaultPath === '/o/X@2x.png' && calls.dialog[2].filters['PNG image'][0] === 'png');
    const copied = await U.handleMessage(api, { type: 'exportScreen', format: 'html', action: 'copy', name: 'A', text: '<html>' });
    check('D12 a text copy goes to the clipboard, no dialog, no file', copied.done === 'copied' && calls.clip[0] === '<html>' && calls.dialog.length === 3 && calls.write.length === 3);
    const imgCopied = await U.handleMessage(api, { type: 'exportScreen', format: 'png', action: 'copied', name: 'A' });
    check('D13 the page\'s own image copy is only reported (nothing to write)', imgCopied.done === 'copied' && imgCopied.format === 'png' && calls.write.length === 3);
    const cancelled = await U.handleMessage({ showSaveDialog: () => Promise.resolve(undefined), writeFile: () => { throw new Error('must not write'); } }, svgMsg);
    check('D14 a cancelled dialog saves nothing', cancelled.done === 'cancelled');
    const failed = await rej(() => U.handleMessage({ showSaveDialog: () => Promise.resolve('t'), writeFile: () => Promise.reject(new Error('disk full')) }, svgMsg));
    check('D15 a failed write rejects with its own error', failed && /disk full/.test(failed.message));
    const noteRes = await U.handleMessage(api, { type: 'exportScreen', format: 'png', action: 'save', name: 'X', png: pngMsg.png, notice: 'because' });
    check('D16 a fallback note from the page reaches the result', noteRes.notice === 'because');
    const survive = JSON.parse(JSON.stringify(pngMsg));
    check('D17 the messages survive JSON (they cross postMessage)', (await U.handleMessage(api, survive)).done === 'saved');
  }

  // ---- E. the DSPF designer page -------------------------------------------------------------------------------------
  console.log('E: the DSPF designer page');
  {
    const posted = [];
    const html = webviewHtml('vscode-webview://fake', 'testnonce', SOURCE, 'CUSTMNT.DSPF');
    const dom = newWebviewDom(html, { beforeParse(window) { window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) }); } });
    await new Promise((r) => setTimeout(r, 300));
    const { document: doc, MessageEvent } = dom.window;
    const settle = () => new Promise((r) => setTimeout(r, 30));
    const exports = () => posted.filter((m) => m.type === 'exportScreen');
    const lastExport = () => exports().slice(-1)[0];
    const host = (data) => dom.window.dispatchEvent(new MessageEvent('message', { data }));

    check('E1 two copies of the controls: the side panel (classic UI) and the pinned toolbar (modern UI)', !!doc.getElementById('asideExportBtn') && !!doc.getElementById('toolbarExportBtn') && !!doc.getElementById('asideExportMore') && !!doc.getElementById('toolbarExportMore'));
    check('E2 the toolbar copy is inside the pinned toolbar, the other is not', !!doc.getElementById('propsPinnedToolbar').querySelector('#toolbarExportBtn') && !doc.getElementById('propsPinnedToolbar').querySelector('#asideExportBtn'));

    host({ type: 'exportSettings', defaultFormat: 'svg', pngScale: 2, ruler: false, textStyle: 'unicode' });
    doc.getElementById('toolbarExportBtn').click();
    await settle();
    const e1 = lastExport();
    check('E3 the toolbar button posts a save in the default format with what the preview shows', !!e1 && e1.action === 'save' && e1.format === 'svg' && e1.name === 'HDRREC' && /CUSTOMER MAINTENANCE/.test(plain(e1.text)));
    doc.getElementById('asideExportBtn').click();
    await settle();
    check('E4 the side panel button does the same', exports().length === 2 && lastExport().format === 'svg');

    const more = doc.getElementById('toolbarExportMore');
    more.value = 'copy:text';
    more.dispatchEvent(new dom.window.Event('change'));
    await settle();
    check('E5 the list copies the screen as text', lastExport().action === 'copy' && lastExport().format === 'text' && /Screen preview: HDRREC/.test(lastExport().text) && more.value === '');

    host({ type: 'exportSettings', defaultFormat: 'text', pngScale: 2, ruler: true, textStyle: 'ascii' });
    host({ type: 'exportScreenRequest' });
    await settle();
    check('E6 the host\'s request (the command) exports in the new default format, with the ruler setting', lastExport().format === 'text' && lastExport().action === 'save' && /1234567890/.test(lastExport().text));

    // the indicator state the preview shows
    const before = lastExport().text;
    const indicatorBox = Array.from(doc.querySelectorAll('#indicatorList input[type=checkbox]')).find((b) => /10/.test((b.parentElement && b.parentElement.textContent) || '') || b.value === '10' || b.getAttribute('data-indicator') === '10');
    if (indicatorBox) { indicatorBox.checked = true; indicatorBox.dispatchEvent(new dom.window.Event('change', { bubbles: true })); await settle(); }
    host({ type: 'exportScreenRequest' });
    await settle();
    check('E7 the export follows the indicators switched on in the preview', !!indicatorBox && lastExport().text !== before && /Indicator ten is on/.test(lastExport().text) && !/Indicator ten is off/.test(lastExport().text));

    // a different record
    const recordSelect = doc.getElementById('recordSelect');
    recordSelect.value = 'MENU1';
    recordSelect.dispatchEvent(new dom.window.Event('change'));
    await settle();
    host({ type: 'exportScreenRequest' });
    await settle();
    check('E8 the export is of the record selected now, named after it', lastExport().name === 'MENU1' && /Second record/.test(lastExport().text));

    // theme from the page
    dom.window.document.body.style.setProperty('--accent', '#12ab34');
    host({ type: 'exportScreenRequest', format: 'svg' });
    await settle();
    check('E9 the page\'s own accent colour reaches the file, in place of the classic green', /#12ab34/i.test(lastExport().text) && !/#33ff66/i.test(lastExport().text));

    // PNG without a canvas in jsdom: an error message, never a hang or a half file
    const before2 = posted.length;
    host({ type: 'exportScreenRequest', format: 'png' });
    await new Promise((r) => setTimeout(r, 200));
    const tail = posted.slice(before2);
    check('E10 a PNG in a page that cannot draw it (jsdom has no canvas) posts no half-made export', !tail.some((m) => m.type === 'exportScreen'));
    dom.window.close();
  }

  // ---- F. the menu designer page -------------------------------------------------------------------------------------
  console.log('F: the menu designer page');
  {
    const posted = [];
    const menuSource = [
      '     A                                      DSPSIZ(24 80 *DS3)',
      '     A          R MENU',
      "     A                                  1  2'MAIN MENU'",
      "     A                                  3  5'1. Display library list'",
    ].join('\n') + '\n';
    const html = menuWebviewHtml('vscode-webview://fake', 'testnonce', menuSource, '0001 DSPLIBL\n', 'MYMENU.MNUDDS', 'MYMENUQQ.MNUCMD', 'loaded');
    const dom = newWebviewDom(html, { beforeParse(window) { window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) }); } });
    await new Promise((r) => setTimeout(r, 300));
    const { document: doc, MessageEvent } = dom.window;
    const settle = () => new Promise((r) => setTimeout(r, 30));
    const lastExport = () => posted.filter((m) => m.type === 'exportScreen').slice(-1)[0];
    const host = (data) => dom.window.dispatchEvent(new MessageEvent('message', { data }));

    check('F1 the menu designer has one copy of the controls (it has no separate toolbar)', !!doc.getElementById('ExportBtn') && !!doc.getElementById('ExportMore') && doc.querySelectorAll('.export-group').length === 1);
    host({ type: 'exportSettings', defaultFormat: 'html', pngScale: 2, ruler: false, textStyle: 'unicode' });
    doc.getElementById('ExportBtn').click();
    await settle();
    check('F2 the button exports the menu\'s screen in the default format', !!lastExport() && lastExport().format === 'html' && lastExport().action === 'save' && lastExport().name === 'MENU' && /MAIN MENU/.test(plain(lastExport().text)));
    host({ type: 'exportScreenRequest', format: 'text' });
    await settle();
    check('F3 the command\'s request works here too', lastExport().format === 'text' && /Display library list/.test(lastExport().text));
    const more = doc.getElementById('ExportMore');
    more.value = 'copy:svg';
    more.dispatchEvent(new dom.window.Event('change'));
    await settle();
    check('F4 the list copies the SVG', lastExport().action === 'copy' && lastExport().format === 'svg' && lastExport().text.includes('<svg'));
    dom.window.close();
  }

  // ---- G. the extension host against the vscode mock -------------------------------------------------------------------
  console.log('G: the extension host');
  {
    const context = vscodeMock.__mockExtensionContext();
    ext.activate(context);
    const cmd = vscodeMock.__registeredCommands['dspfDesigner.exportScreenPreview'];
    check('G1 the command is registered', typeof cmd === 'function');
    vscodeMock.__lastWarning = undefined;
    cmd();
    check('G2 no designer open: a warning that says what to do', /Open a display file or a menu in the iSDA designer/.test(vscodeMock.__lastWarning || ''));

    function makePanel(over) {
      const state = { handler: null, disposed: null, html: null, posted: [] };
      const panel = Object.assign({
        active: true, visible: true,
        webview: {
          cspSource: 'vscode-webview://fake', options: null,
          set html(v) { state.html = v; }, get html() { return state.html; },
          onDidReceiveMessage: (h) => { state.handler = h; return { dispose: () => {} }; },
          postMessage: (m) => { state.posted.push(m); return Promise.resolve(true); },
        },
        onDidDispose: (h) => { state.disposed = h; return { dispose: () => {} }; },
      }, over || {});
      return { panel, state };
    }
    const dspfEntry = vscodeMock.__registeredCustomEditorProviders['dspfDesigner.editor'];
    const menuEntry = vscodeMock.__registeredCustomEditorProviders['dspfDesigner.menuEditor'];
    const dspfDoc = vscodeMock.__mockDocument(SOURCE, new vscodeMock.Uri('file', '/work/proj/CUSTMNT.dspf'));
    const a = makePanel();
    await dspfEntry.provider.resolveCustomTextEditor(dspfDoc, a.panel, {});

    vscodeMock.__clearMockConfig();
    vscodeMock.__setMockConfig('isda.export.defaultFormat', 'svg');
    vscodeMock.__setMockConfig('isda.export.pngScale', 3);
    vscodeMock.__setMockConfig('isda.export.ruler', true);
    vscodeMock.__setMockConfig('isda.export.textStyle', 'ascii');
    await a.state.handler({ type: 'ready' });
    const sent = a.state.posted.find((m) => m.type === 'exportSettings');
    check('G3 the settings are sent to the page on ready', !!sent && sent.defaultFormat === 'svg' && sent.pngScale === 3 && sent.ruler === true && sent.textStyle === 'ascii');
    a.state.posted.length = 0;
    vscodeMock.__setMockConfig('isda.export.defaultFormat', 'html');
    vscodeMock.__fireConfigChange('isda.export.defaultFormat');
    check('G4 a change to a setting is sent again', a.state.posted.some((m) => m.type === 'exportSettings' && m.defaultFormat === 'html'));
    a.state.posted.length = 0;
    vscodeMock.__fireConfigChange('isda.messageFiles');
    check('G5 an unrelated setting sends nothing', !a.state.posted.some((m) => m.type === 'exportSettings'));

    // the command reaches the active designer
    a.state.posted.length = 0;
    cmd();
    check('G6 the command asks the active designer for its screen', a.state.posted.some((m) => m.type === 'exportScreenRequest'));

    // saving
    vscodeMock.__setSaveDialogResponse((o) => new vscodeMock.Uri('file', '/chosen/' + (o.defaultUri ? o.defaultUri.path.split('/').pop() : 'x.svg')));
    vscodeMock.__lastInformation = undefined;
    await a.state.handler({ type: 'exportScreen', format: 'svg', action: 'save', name: 'HDRREC', text: '<svg>one</svg>' });
    const dlg = vscodeMock.__lastSaveDialog;
    check('G7 a save opens the dialog at the member\'s folder, named member-record', !!dlg && dlg.defaultUri && dlg.defaultUri.path === '/work/proj/CUSTMNT-HDRREC.svg' && dlg.filters.SVG[0] === 'svg');
    check('G8 and writes the file where the user chose, then says so', vscodeMock.__lastWrittenFile && vscodeMock.__lastWrittenFile.uri.path === '/chosen/CUSTMNT-HDRREC.svg' && vscodeMock.__lastWrittenFile.text === '<svg>one</svg>' && /Saved the screen preview as CUSTMNT-HDRREC\.svg/.test(vscodeMock.__lastInformation || ''));
    const writtenBefore = vscodeMock.__lastWrittenFile;
    vscodeMock.__setSaveDialogResponse(undefined);
    await a.state.handler({ type: 'exportScreen', format: 'text', action: 'save', name: 'HDRREC', text: 'x\n' });
    check('G9 a cancelled dialog writes nothing', vscodeMock.__lastWrittenFile === writtenBefore);
    vscodeMock.__clipboardText = undefined;
    vscodeMock.__lastInformation = undefined;
    await a.state.handler({ type: 'exportScreen', format: 'text', action: 'copy', name: 'HDRREC', text: 'on the clipboard\n' });
    check('G10 a text copy goes to the clipboard and says so', vscodeMock.__clipboardText === 'on the clipboard\n' && /Copied the screen preview to the clipboard\./.test(vscodeMock.__lastInformation || ''));
    vscodeMock.__lastInformation = undefined;
    await a.state.handler({ type: 'exportScreen', format: 'png', action: 'copied', name: 'HDRREC' });
    check('G11 the page\'s own image copy is acknowledged', /as an image/.test(vscodeMock.__lastInformation || ''));
    vscodeMock.__lastError = undefined;
    await a.state.handler({ type: 'exportScreen', format: 'svg', action: 'save', name: 'HDRREC', text: '' });
    check('G12 a bad message is an error message, not a crash', /Could not export the screen preview: .*no content/.test(vscodeMock.__lastError || ''));
    const pngBytes = makePng(30, 10);
    vscodeMock.__setSaveDialogResponse(new vscodeMock.Uri('file', '/chosen/shot.png'));
    await a.state.handler({ type: 'exportScreen', format: 'png', action: 'save', name: 'HDRREC', png: { type: 'exportPng', name: 'HDRREC', scale: 2, width: 30, height: 10, base64: pngBytes.toString('base64') } });
    check('G13 a PNG is written from the exact bytes', vscodeMock.__lastWrittenFile && vscodeMock.__lastWrittenFile.uri.path === '/chosen/shot.png' && vscodeMock.__lastSaveDialog.defaultUri.path === '/work/proj/CUSTMNT-HDRREC@2x.png');

    // a member (IBM i) source has no local folder: the workspace folder is offered instead
    const memberDoc = vscodeMock.__mockDocument(SOURCE, new vscodeMock.Uri('member', '/MYLIB/QDDSSRC/CUSTMNT.DSPF'));
    const m = makePanel({ active: false });
    await dspfEntry.provider.resolveCustomTextEditor(memberDoc, m.panel, {});
    vscodeMock.__setSaveDialogResponse(undefined);
    await m.state.handler({ type: 'exportScreen', format: 'svg', action: 'save', name: 'HDRREC', text: '<svg/>' });
    check('G14 an IBM i member offers the workspace folder and the member name', vscodeMock.__lastSaveDialog.defaultUri && vscodeMock.__lastSaveDialog.defaultUri.path === '/workspace/CUSTMNT-HDRREC.svg');

    // two designers: the active one gets the request
    a.state.posted.length = 0; m.state.posted.length = 0;
    cmd();
    check('G15 with two designers open, only the active one is asked', a.state.posted.some((x) => x.type === 'exportScreenRequest') && !m.state.posted.some((x) => x.type === 'exportScreenRequest'));
    a.panel.active = false; m.panel.active = false; a.panel.visible = true; m.panel.visible = false;
    a.state.posted.length = 0;
    cmd();
    check('G16 with none active, a single visible designer is used', a.state.posted.some((x) => x.type === 'exportScreenRequest'));
    m.panel.visible = true;
    a.state.posted.length = 0; m.state.posted.length = 0; vscodeMock.__lastWarning = undefined;
    cmd();
    check('G17 with none active and two visible, nothing is guessed: a warning', !a.state.posted.length && !m.state.posted.length && /Open a display file or a menu/.test(vscodeMock.__lastWarning || ''));

    // the menu designer
    const menuDoc = vscodeMock.__mockDocument('     A          R MENU\n     A                                  1  2\'M\'\n', new vscodeMock.Uri('member', '/MYLIB/QDDSSRC/MYMENU.MNUDDS'));
    vscodeMock.__setMockFile(new vscodeMock.Uri('member', '/MYLIB/QDDSSRC/MYMENUQQ.MNUCMD'), '0001 DSPLIBL\n');
    const mn = makePanel();
    await menuEntry.provider.resolveCustomTextEditor(menuDoc, mn.panel, {});
    m.panel.visible = false; a.panel.visible = false;
    await mn.state.handler({ type: 'ready' });
    check('G18 the menu designer gets the settings on ready', mn.state.posted.some((x) => x.type === 'exportSettings' && x.defaultFormat === 'html'));
    mn.state.posted.length = 0;
    cmd();
    check('G19 the command reaches the menu designer when it is the active one', mn.state.posted.some((x) => x.type === 'exportScreenRequest'));
    vscodeMock.__setSaveDialogResponse(undefined);
    await mn.state.handler({ type: 'exportScreen', format: 'html', action: 'save', name: 'MENU', text: '<html/>' });
    check('G20 and a menu export is saved under the menu\'s name', vscodeMock.__lastSaveDialog.defaultUri && vscodeMock.__lastSaveDialog.defaultUri.path === '/workspace/MYMENU-MENU.html');
    mn.state.posted.length = 0;
    vscodeMock.__fireConfigChange('isda.export.ruler');
    check('G21 a settings change reaches the menu designer too', mn.state.posted.some((x) => x.type === 'exportSettings'));

    // dispose
    mn.state.disposed();
    a.state.disposed();
    m.state.disposed();
    vscodeMock.__lastWarning = undefined;
    a.state.posted.length = 0;
    cmd();
    check('G22 a closed designer is forgotten: the command warns again', /Open a display file or a menu/.test(vscodeMock.__lastWarning || '') && !a.state.posted.length);
    a.state.posted.length = 0;
    vscodeMock.__fireConfigChange('isda.export.ruler');
    check('G23 and its settings listener is gone', !a.state.posted.length);
    vscodeMock.__clearMockConfig();
    vscodeMock.__setSaveDialogResponse(undefined);
  }

  // ---- H. package.json and the module -------------------------------------------------------------------------------
  console.log('H: package.json');
  {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf8'));
    const props = pkg.contributes.configuration.properties;
    check('H1 the four settings exist', ['defaultFormat', 'pngScale', 'ruler', 'textStyle'].every((k) => props['isda.export.' + k]));
    check('H2 defaultFormat: the enum is the module\'s formats and the default is the module\'s default', JSON.stringify(props['isda.export.defaultFormat'].enum) === JSON.stringify(U.FORMATS) && props['isda.export.defaultFormat'].default === U.DEFAULT_FORMAT);
    check('H3 pngScale: the enum is the PNG scales and the default is the PNG default', JSON.stringify(props['isda.export.pngScale'].enum) === JSON.stringify(P.SCALES) && props['isda.export.pngScale'].default === P.DEFAULT_SCALE);
    check('H4 textStyle: the enum is the module\'s styles, default unicode', JSON.stringify(props['isda.export.textStyle'].enum) === JSON.stringify(U.TEXT_STYLES) && props['isda.export.textStyle'].default === 'unicode');
    check('H5 ruler: boolean, default off', props['isda.export.ruler'].type === 'boolean' && props['isda.export.ruler'].default === false);
    check('H6 the defaults in package.json are what readSettings gives with nothing set', (() => {
      const d = U.readSettings();
      return props['isda.export.defaultFormat'].default === d.defaultFormat && props['isda.export.pngScale'].default === d.pngScale && props['isda.export.ruler'].default === d.ruler && props['isda.export.textStyle'].default === d.textStyle;
    })());
    const command = pkg.contributes.commands.find((c) => c.command === 'dspfDesigner.exportScreenPreview');
    check('H7 the command is contributed with its title', !!command && command.title === 'iSDA: Export Screen Preview');
    check('H8 screenExportUi.js is in the dist copy list, after the three it needs', (() => {
      const list = pkg.scripts['build:webview-assets'];
      const i = ['screenExport.js', 'screenPng.js', 'screenText.js', 'screenExportUi.js'].map((f) => list.indexOf("'" + f + "'"));
      return i.every((n) => n > 0) && i[3] > i[0] && i[3] > i[1] && i[3] > i[2];
    })());
    const src = fs.readFileSync(path.join(__dirname, '../screenExportUi.js'), 'utf8');
    check('H9 no vscode import and no remote URL in the module', !/require\(['"]vscode['"]\)/.test(src) && !/https?:\/\//.test(src.replace(/\/\*[\s\S]*?\*\//g, '')));
    check('H10 the dist copy equals the source', fs.readFileSync(path.join(__dirname, '../../dist/screenExportUi.js'), 'utf8') === src);
  }
}

main().then(() => process.exit(failureCount() === 0 ? 0 : 1), (err) => { console.log('FAIL  - unexpected error:', err && err.stack || err); process.exit(1); });

/**
 * e5gRelease.test.js
 *
 * E5g - the E5 release: end-to-end evidence for the acceptance paragraph, which no single sub-task test holds. The sub-task tests
 * (e5b - e5f) hold each piece; this file runs the pieces together, page to extension host to file:
 *   A. both designers x both UI styles: the visible Export button saves the screen as PNG, SVG, HTML and plain text, each file checked
 *      (a PNG with the right size, well-formed SVG, a standalone HTML page, a text dump), in the indicator state the preview shows.
 *   B. the command reaches the page and the same file comes back.
 *   C. the batch from both designers: every record at every DSPSIZ in a folder with an index page whose links all resolve.
 *   D. the settings and the commands the release advertises are contributed.
 *
 * The page is the real generated one in jsdom; jsdom has no canvas, so the canvas is faked with one that returns a real PNG of the
 * size it was asked for (the real rasterising was looked at in headless Chromium for E5c). The extension host is the real
 * extension.ts on the vscode mock. Run with: node src/test/e5gRelease.test.js   (needs `npm run compile`)
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

const { JSDOM } = require('jsdom');
const vscodeMock = require('./vscode-mock.js');
const { check, failureCount } = require('./helpers/harness');
const { newWebviewDom, webviewHtml, menuWebviewHtml } = require('./helpers/common');
const { buildLine: L } = require('../fixtures/lineBuilder.js');
const ext = require(path.join(__dirname, '../../dist/extension.js'));

// ---- a real PNG without a canvas
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
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.concat(Array.from({ length: h }, () => row)))), chunk('IEND', Buffer.alloc(0))]);
}

const DSPF_SOURCE = [
  L({ func: 'DSPSIZ(24 80 *DS3 27 132 *DS4)' }),
  L({ nameType: 'R', name: 'HDRREC' }),
  L({ line: 1, col: 2, func: "'CUSTOMER MAINTENANCE'" }),
  L({ ind1: '10', line: 3, col: 2, func: "'Indicator ten is on'" }),
  L({ ind1: 'N10', line: 3, col: 30, func: "'Indicator ten is off'" }),
  L({ nameType: 'R', name: 'DETAIL' }),
  L({ line: 2, col: 2, func: "'Second record'" }),
  L({ nameType: 'R', name: 'WIDEONLY', sizeCondition: '*DS4' }),
  L({ line: 3, col: 2, func: "'Only on the wide screen'" }),
].join('\n') + '\n';
const MENU_SOURCE = [
  L({ func: 'DSPSIZ(24 80 *DS3)' }),
  L({ nameType: 'R', name: 'MENU' }),
  L({ line: 1, col: 2, func: "'MAIN MENU'" }),
  L({ ind1: '10', line: 3, col: 5, func: "'Indicator ten is on'" }),
  L({ ind1: 'N10', line: 3, col: 40, func: "'Indicator ten is off'" }),
].join('\n') + '\n';

const plain = (t) => String(t).replace(/&#160;|&nbsp;| /g, ' ');
const settle = (ms) => new Promise((r) => setTimeout(r, ms || 40));

/** A designer page with a fake canvas, and the messages it posts. */
function openPage(html) {
  const posted = [];
  const dom = newWebviewDom(html, {
    beforeParse(window) {
      window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
      window.Image = class { set src(v) { setTimeout(() => { if (this.onload) this.onload(); }, 0); } };
      let lastCanvas = null;
      window.HTMLCanvasElement.prototype.getContext = function () { lastCanvas = this; return { drawImage() {} }; };
      window.HTMLCanvasElement.prototype.toDataURL = function () { return 'data:image/png;base64,' + makePng(this.width, this.height).toString('base64'); };
    },
  });
  return { dom, posted, doc: dom.window.document, host: (data) => dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data })) };
}

/** The real extension host: a provider resolved for a document, with a panel that keeps its handler and what was posted to it. */
async function openHost(kind, doc, active) {
  const entry = vscodeMock.__registeredCustomEditorProviders[kind === 'menu' ? 'dspfDesigner.menuEditor' : 'dspfDesigner.editor'];
  const state = { handler: null, disposed: null, posted: [] };
  const panel = {
    active: active !== false, visible: true,
    webview: {
      cspSource: 'x', options: null, set html(v) {}, get html() { return ''; },
      onDidReceiveMessage: (h) => { state.handler = h; return { dispose: () => {} }; },
      postMessage: (m) => { state.posted.push(m); return Promise.resolve(true); },
    },
    onDidDispose: (h) => { state.disposed = h; return { dispose: () => {} }; },
  };
  await entry.provider.resolveCustomTextEditor(doc, panel, {});
  return { panel, state };
}

async function main() {
  const context = vscodeMock.__mockExtensionContext();
  ext.activate(context);
  vscodeMock.__clearMockConfig();

  // every file the host writes, by path
  const written = {};
  const origWrite = vscodeMock.workspace.fs.writeFile;
  vscodeMock.workspace.fs.writeFile = (uri, bytes) => { written[uri.path] = Buffer.from(bytes); return Promise.resolve(); };
  const text = (p) => (written[p] ? written[p].toString('utf8') : undefined);
  const parseXml = (xml) => new JSDOM(xml, { contentType: 'image/svg+xml' }).window.document;
  const pngSize = (b) => ({ w: b.readUInt32BE(16), h: b.readUInt32BE(20) });

  // the pages and their hosts: the screen designer in the modern and the classic UI, and the menu designer
  const dspfDoc = vscodeMock.__mockDocument(DSPF_SOURCE, new vscodeMock.Uri('file', '/work/CUSTMNT.dspf'));
  const menuUri = new vscodeMock.Uri('member', '/MYLIB/QDDSSRC/MYMENU.MNUDDS');
  vscodeMock.__setMockFile(new vscodeMock.Uri('member', '/MYLIB/QDDSSRC/MYMENUQQ.MNUCMD'), '0001 DSPLIBL\n');
  const menuDoc = vscodeMock.__mockDocument(MENU_SOURCE, menuUri);

  const designers = [
    { label: 'screen designer, modern UI', kind: 'dspf', style: 'modern', buttonId: 'toolbarExportBtn', moreId: 'toolbarExportMore', doc: dspfDoc, record: 'HDRREC', member: 'CUSTMNT', ext: 'dspf',
      html: () => webviewHtml('vscode-webview://fake', 'n1', DSPF_SOURCE, 'CUSTMNT.DSPF', 'modern', 'green') },
    { label: 'screen designer, classic UI', kind: 'dspf', style: 'classic', buttonId: 'asideExportBtn', moreId: 'asideExportMore', doc: dspfDoc, record: 'HDRREC', member: 'CUSTMNT', ext: 'dspf',
      html: () => webviewHtml('vscode-webview://fake', 'n2', DSPF_SOURCE, 'CUSTMNT.DSPF', 'classic', 'green') },
    { label: 'menu designer', kind: 'menu', style: 'modern', buttonId: 'ExportBtn', moreId: 'ExportMore', doc: menuDoc, record: 'MENU', member: 'MYMENU', ext: 'mnudds',
      html: () => menuWebviewHtml('vscode-webview://fake', 'n3', MENU_SOURCE, '0001 DSPLIBL\n', 'MYMENU.MNUDDS', 'MYMENUQQ.MNUCMD', 'loaded', 'modern', 'green') },
  ];

  // ---- A. both designers x both UI styles x four formats ---------------------------------------------------------------
  console.log('A: the Export button, four formats');
  for (const d of designers) {
    const page = openPage(d.html());
    const host = await openHost(d.kind, d.doc);
    await settle(300);

    // the control that is visible in this UI style is the one that works
    const win = page.dom.window;
    const shown = (el) => { for (let n = el; n && n.nodeType === 1; n = n.parentElement) { if (win.getComputedStyle(n).display === 'none') return false; } return true; };
    const button = page.doc.getElementById(d.buttonId);
    check('A: ' + d.label + ': the Export button of this UI style is on the page and shown', !!button && shown(button));
    if (d.kind === 'dspf') {
      const other = page.doc.getElementById(d.style === 'modern' ? 'asideExportBtn' : 'toolbarExportBtn');
      check('A: ' + d.label + ': the other copy exists but is not shown (the same wiring, one per UI style)', !!other && !shown(other));
    }

    // the indicator state the preview shows: indicator 10 on
    if (d.kind === 'dspf') {
      const box = Array.from(page.doc.querySelectorAll('#indicatorList input[type=checkbox]')).find((b) => b.value === '10' || b.getAttribute('data-indicator') === '10' || /(^|\D)10(\D|$)/.test((b.parentElement && b.parentElement.textContent) || ''));
      if (box) { box.checked = true; box.dispatchEvent(new win.Event('change', { bubbles: true })); await settle(); }
    } else {
      const box = Array.from(page.doc.querySelectorAll('#indicatorList input[type=checkbox]')).find((b) => b.value === '10' || b.getAttribute('data-indicator') === '10' || /(^|\D)10(\D|$)/.test((b.parentElement && b.parentElement.textContent) || ''));
      if (box) { box.checked = true; box.dispatchEvent(new win.Event('change', { bubbles: true })); await settle(); }
    }

    vscodeMock.__setSaveDialogResponse((o) => new vscodeMock.Uri('file', '/saved/' + o.defaultUri.path.split('/').pop()));
    for (const fmt of ['png', 'svg', 'html', 'text']) {
      Object.keys(written).forEach((k) => delete written[k]);
      page.host({ type: 'exportSettings', defaultFormat: fmt, pngScale: 2, ruler: false, textStyle: 'unicode' });
      const before = page.posted.length;
      button.click();
      await settle(fmt === 'png' ? 120 : 40);
      const msgs = page.posted.slice(before).filter((m) => m.type === 'exportScreen');
      check('A: ' + d.label + ' / ' + fmt + ': the click posts one export for the record shown', msgs.length === 1 && msgs[0].format === fmt && msgs[0].action === 'save' && msgs[0].name === d.record);
      if (msgs.length !== 1) continue;
      await host.state.handler(JSON.parse(JSON.stringify(msgs[0])));
      const base = '/saved/' + d.member + '-' + d.record;
      if (fmt === 'png') {
        const file = written[base + '@2x.png'];
        const svgW = 9 * (d.kind === 'dspf' ? 80 : 80) + 24;
        check('A: ' + d.label + ' / png: a real PNG, 2x the drawing, named MEMBER-RECORD@2x.png', !!file && file.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) && pngSize(file).w === svgW * 2 && pngSize(file).h === (20 * 24 + 24) * 2);
      } else if (fmt === 'svg') {
        const body = text(base + '.svg');
        let ok = false, words = '';
        try { const x = parseXml(body); ok = x.documentElement.nodeName === 'svg'; words = plain(x.documentElement.textContent); } catch (e) { ok = false; }
        check('A: ' + d.label + ' / svg: well-formed SVG with the record, in the indicator state shown (ten on)', ok && /Indicator ten is on/.test(words) && !/Indicator ten is off/.test(words) && !/<script|https?:\/\/(?!www\.w3\.org)/i.test(body));
      } else if (fmt === 'html') {
        const body = text(base + '.html');
        check('A: ' + d.label + ' / html: a standalone page with the same screen (ten on), no script, no remote file', /^<!doctype html>/i.test(body || '') && /Indicator ten is on/.test(plain(body)) && !/Indicator ten is off/.test(plain(body)) && !/<script|<link|https?:\/\/(?!www\.w3\.org)/i.test(body));
      } else {
        const body = text(base + '.txt');
        check('A: ' + d.label + ' / text: the dump with its header, 24 rows, in the same state', new RegExp('^Screen preview: ' + d.record + ' \\(24 x 80\\)').test(body || '') && /Indicator ten is on/.test(body) && !/Indicator ten is off/.test(body) && (body.split('\n').length >= 26));
      }
    }

    // B. the command reaches the page and the page answers with the same file
    host.panel.active = true;
    page.host({ type: 'exportSettings', defaultFormat: 'svg', pngScale: 2, ruler: false, textStyle: 'unicode' });
    host.state.posted.length = 0;
    const others = designers.filter((x) => x !== d);
    void others;
    await vscodeMock.__registeredCommands['dspfDesigner.exportScreenPreview']();
    const req = host.state.posted.filter((m) => m.type === 'exportScreenRequest');
    check('B: ' + d.label + ': the command asks the designer in front', req.length === 1);
    const before = page.posted.length;
    page.host(req[0] || { type: 'exportScreenRequest' });
    await settle();
    const reply = page.posted.slice(before).filter((m) => m.type === 'exportScreen');
    check('B: ' + d.label + ': the page answers with the screen it shows, in the default format', reply.length === 1 && reply[0].format === 'svg' && /Indicator ten is on/.test(plain(reply[0].text)));
    Object.keys(written).forEach((k) => delete written[k]);
    await host.state.handler(JSON.parse(JSON.stringify(reply[0])));
    check('B: ' + d.label + ': and the host saves it', Object.keys(written).length === 1 && Object.keys(written)[0] === '/saved/' + d.member + '-' + d.record + '.svg');

    host.state.disposed();
    page.dom.window.close();
  }

  // ---- C. the batch, from both designers ------------------------------------------------------------------------------------
  console.log('C: the batch export');
  vscodeMock.__setOpenDialogResponse([new vscodeMock.Uri('file', '/out')]);
  vscodeMock.__setWarningResponse('Replace');
  for (const d of [designers[0], designers[2]]) {
    Object.keys(written).forEach((k) => delete written[k]);
    vscodeMock.__clearMockDirs();
    const host = await openHost(d.kind, d.doc);
    vscodeMock.__lastInformation = undefined;
    await vscodeMock.__registeredCommands['dspfDesigner.exportAllScreenPreviews']();
    const folder = '/out/' + d.member + '-screens/';
    const files = Object.keys(written).filter((p) => p.startsWith(folder)).map((p) => p.slice(folder.length));
    const records = d.kind === 'dspf' ? ['HDRREC', 'DETAIL', 'WIDEONLY'] : ['MENU'];
    const sizes = d.kind === 'dspf' ? ['24x80', '27x132'] : ['24x80'];
    const expected = [];
    records.forEach((r) => sizes.forEach((s) => { if (!(r === 'WIDEONLY' && s === '24x80')) ['svg', 'html', 'txt'].forEach((f) => expected.push(r + '-' + s + '.' + f)); }));
    expected.push('index.html');
    check('C: ' + d.label + ': every record at every DSPSIZ is written, and nothing else (' + expected.length + ' files)', files.length === expected.length && expected.every((f) => files.includes(f)));
    const index = text(folder + 'index.html') || '';
    const links = Array.from(index.matchAll(/(?:href|src)="([^"]+)"/g)).map((m) => m[1]);
    check('C: ' + d.label + ': the index page links every file and every link resolves', links.length > 0 && links.every((l) => files.includes(l)) && expected.filter((f) => f !== 'index.html').every((f) => links.includes(f)));
    check('C: ' + d.label + ': the index names every record, and says which screen is not shown at which size', records.every((r) => index.includes('<h2>' + r + '<span')) && (d.kind !== 'dspf' || /24 x 80 \(\*DS3\): not exported - not shown at this display size/.test(index)));
    check('C: ' + d.label + ': every picture in the batch is well-formed SVG', files.filter((f) => f.endsWith('.svg')).every((f) => { try { return parseXml(text(folder + f)).documentElement.nodeName === 'svg'; } catch (e) { return false; } }));
    check('C: ' + d.label + ': the end message says how many screens were exported', new RegExp('Exported ' + (expected.length - 1) / 3 + ' screens? to ' + d.member + '-screens').test(vscodeMock.__lastInformation || ''));
    host.state.disposed();
  }
  vscodeMock.__setWarningResponse(undefined);
  vscodeMock.__setOpenDialogResponse(undefined);
  vscodeMock.workspace.fs.writeFile = origWrite;

  // ---- D. what the release advertises ------------------------------------------------------------------------------------------
  console.log('D: package.json');
  {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf8'));
    const titles = pkg.contributes.commands.map((c) => c.title);
    check('D1 both commands are contributed', titles.includes('iSDA: Export Screen Preview') && titles.includes('iSDA: Export All Screen Previews'));
    const props = pkg.contributes.configuration.properties;
    check('D2 the four export settings are contributed', ['defaultFormat', 'pngScale', 'ruler', 'textStyle'].every((k) => props['isda.export.' + k]));
    check('D3 every E5 module is in the build copy list (serialiser, PNG, text, UI, batch)', ['screenExport.js', 'screenPng.js', 'screenText.js', 'screenExportUi.js', 'screenBatch.js'].every((f) => pkg.scripts['build:webview-assets'].includes("'" + f + "'")));
    check('D4 the dist copies equal the sources', ['screenExport.js', 'screenPng.js', 'screenText.js', 'screenExportUi.js', 'screenBatch.js'].every((f) => fs.readFileSync(path.join(__dirname, '../../dist/' + f), 'utf8') === fs.readFileSync(path.join(__dirname, '../' + f), 'utf8')));
  }
}

main().then(() => process.exit(failureCount() === 0 ? 0 : 1), (err) => { console.log('FAIL  - unexpected error:', err && err.stack || err); process.exit(1); });

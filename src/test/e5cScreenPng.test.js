/**
 * e5cScreenPng.test.js
 *
 * E5c - PNG export (src/screenPng.js): the E5b SVG drawn to a canvas in the webview, the bytes checked and saved by the host.
 *   A. scale: 1x / 2x / 3x, default 2x, anything else refused.
 *   B. the SVG on its way in: size read from real buildSvg output (80x24, 132x27, ruler), the data URL decodes back to the same SVG.
 *   C. rasterise with a fake browser (canvas, Image): canvas size = SVG size x scale, drawn at final size, PNG prefix stripped,
 *      and every failure path (image error, no 2D context, no PNG from the canvas, too large, timeout, no browser) rejects.
 *   D. the host: message checks (type, base64, PNG signature, size match, byte cap), file names, save dialog and write, cancel.
 *   E. round trip: rasterise -> toMessage -> parseMessage -> savePng writes the same bytes.
 *   F. the module has no vscode import and is in the dist copy list.
 *
 * Pure Node (the browser is faked; the real-browser look is recorded in the roadmap's E5c results). Run with: node src/test/e5cScreenPng.test.js
 * (needs `npm run compile`)
 */
'use strict';
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');
const { check, failureCount } = require('./helpers/harness');
const P = require(path.join(__dirname, '../../dist/screenPng.js'));
const X = require(path.join(__dirname, '../../dist/screenExport.js'));

// ---- a real PNG without a canvas: 8-bit grey, w x h, all zero
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
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 0; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const row = Buffer.alloc(w + 1);
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// ---- a fake browser: Image loads when src is set, canvas records what it was asked to do
function fakeBrowser(over) {
  const o = Object.assign({ fail: false, noContext: false, badEncode: false, never: false, pngFor: null }, over || {});
  const log = { canvases: [], draws: [], srcs: [], timers: [] };
  class FakeImage {
    set src(v) {
      log.srcs.push(v);
      if (o.never) return;
      setTimeout(() => { if (o.fail) { if (this.onerror) this.onerror(new Error('x')); } else if (this.onload) this.onload(); }, 0);
    }
  }
  const document = {
    createElement(tag) {
      const canvas = {
        tag, width: 0, height: 0,
        getContext(kind) {
          if (o.noContext) return null;
          return { kind, drawImage(img, x, y, w, h) { log.draws.push({ x, y, w, h, canvasW: canvas.width, canvasH: canvas.height }); } };
        },
        toDataURL(type) {
          log.encodedAs = type;
          if (o.badEncode) return 'data:,';
          const png = o.pngFor ? o.pngFor(canvas.width, canvas.height) : makePng(canvas.width, canvas.height);
          return 'data:image/png;base64,' + png.toString('base64');
        }
      };
      log.canvases.push(canvas);
      return canvas;
    }
  };
  return { env: { document, Image: FakeImage }, log };
}

const svg80 = X.buildSvg({ lines: 24, columns: 80, recordName: 'R', fields: [] }, { title: 'R' });
const svg132 = X.buildSvg({ lines: 27, columns: 132, recordName: 'R', fields: [] });
const svgRuler = X.buildSvg({ lines: 24, columns: 80, recordName: 'R', fields: [] }, { ruler: true });

async function main() {
  // ---- A. scale
  check('A1 SCALES are 1, 2, 3', JSON.stringify(P.SCALES) === '[1,2,3]');
  check('A2 default scale is 2', P.DEFAULT_SCALE === 2 && P.normaliseScale() === 2 && P.normaliseScale(null) === 2 && P.normaliseScale('') === 2);
  check('A3 1, 2, 3 as numbers', P.normaliseScale(1) === 1 && P.normaliseScale(2) === 2 && P.normaliseScale(3) === 3);
  check('A4 "1x", "2x", "3x" and "3" as text', P.normaliseScale('1x') === 1 && P.normaliseScale('2X') === 2 && P.normaliseScale('3x') === 3 && P.normaliseScale('3') === 3);
  for (const bad of [0, 4, 1.5, -2, 'big', '4x', NaN, {}]) {
    let err = null;
    try { P.normaliseScale(bad); } catch (e) { err = e; }
    check('A5 scale ' + String(typeof bad === 'object' ? 'object' : bad) + ' is a RangeError', err instanceof RangeError);
  }

  // ---- B. the SVG on its way in
  const s80 = P.svgSize(svg80);
  const s132 = P.svgSize(svg132);
  const sRul = P.svgSize(svgRuler);
  const M = X.METRICS;
  check('B1 80x24 size = grid + padding', s80.width === 80 * M.cellWidth + 2 * M.padding && s80.height === 24 * M.cellHeight + 2 * M.padding);
  check('B2 132x27 size', s132.width === 132 * M.cellWidth + 2 * M.padding && s132.height === 27 * M.cellHeight + 2 * M.padding);
  check('B3 the ruler widens the picture', sRul.width > s80.width && sRul.height > s80.height);
  check('B4 svgSize of a non-string is a TypeError', (() => { try { P.svgSize(5); } catch (e) { return e instanceof TypeError; } return false; })());
  check('B5 svgSize with no width / height is a TypeError', (() => { try { P.svgSize('<svg viewBox="0 0 1 1"></svg>'); } catch (e) { return e instanceof TypeError; } return false; })());
  check('B6 svgSize reads only the root tag', P.svgSize('<svg width="10" height="20"><rect width="99" height="99"/></svg>').width === 10);
  const url = P.svgToDataUrl(svg80);
  check('B7 data URL prefix', url.indexOf('data:image/svg+xml;charset=utf-8,') === 0);
  check('B8 data URL decodes back to the same SVG', decodeURIComponent(url.slice(url.indexOf(',') + 1)) === svg80);
  check('B9 no raw # or newline in the URL (colours and line breaks are escaped)', !/[#\n]/.test(url));

  // ---- C. rasterise with a fake browser
  for (const scale of [1, 2, 3]) {
    const fb = fakeBrowser();
    const r = await P.rasterise(svg80, { scale }, fb.env);
    check('C1 scale ' + scale + ': canvas = SVG x scale', fb.log.canvases[0].width === s80.width * scale && fb.log.canvases[0].height === s80.height * scale);
    check('C2 scale ' + scale + ': drawn once, at the canvas size, from the corner', fb.log.draws.length === 1 && fb.log.draws[0].x === 0 && fb.log.draws[0].y === 0 && fb.log.draws[0].w === s80.width * scale && fb.log.draws[0].h === s80.height * scale);
    check('C3 scale ' + scale + ': result size and scale', r.width === s80.width * scale && r.height === s80.height * scale && r.scale === scale);
    check('C4 scale ' + scale + ': base64 is a PNG of that size', (() => { const b = Buffer.from(r.base64, 'base64'); const z = P.readPngSize(b); return !!z && z.width === r.width && z.height === r.height; })());
    check('C5 scale ' + scale + ': asked for image/png', fb.log.encodedAs === 'image/png');
  }
  {
    const fb = fakeBrowser();
    const r = await P.rasterise(svg132, undefined, fb.env);
    check('C6 no options: default scale 2 on 132x27', r.scale === 2 && r.width === s132.width * 2 && r.height === s132.height * 2);
    check('C7 the image source is the SVG data URL', fb.log.srcs.length === 1 && fb.log.srcs[0] === P.svgToDataUrl(svg132));
    check('C8 base64 has no data: prefix', r.base64.indexOf('data:') !== 0 && /^[A-Za-z0-9+/]+=*$/.test(r.base64));
  }
  async function rejects(label, fn, kind) {
    let err = null;
    try { await fn(); } catch (e) { err = e; }
    check(label, !!err && (!kind || err instanceof kind));
    return err;
  }
  await rejects('C9 image error rejects', () => P.rasterise(svg80, {}, fakeBrowser({ fail: true }).env), Error);
  await rejects('C10 no 2D context rejects', () => P.rasterise(svg80, {}, fakeBrowser({ noContext: true }).env), Error);
  await rejects('C11 canvas that cannot encode PNG rejects', () => P.rasterise(svg80, {}, fakeBrowser({ badEncode: true }).env), Error);
  await rejects('C12 bad scale rejects with RangeError', () => P.rasterise(svg80, { scale: 7 }, fakeBrowser().env), RangeError);
  await rejects('C13 non-SVG input rejects with TypeError', () => P.rasterise('not an svg', {}, fakeBrowser().env), TypeError);
  {
    const fb = fakeBrowser({ never: true });
    const err = await rejects('C14 an image that never loads times out', () => P.rasterise(svg80, { timeoutMs: 20 }, fb.env), Error);
    check('C15 the timeout says it took too long', !!err && /too long/.test(err.message));
  }
  {
    const huge = '<svg xmlns="http://www.w3.org/2000/svg" width="6000" height="6000"></svg>';
    const fb = fakeBrowser();
    const err = await rejects('C16 a picture past the canvas limit is refused before drawing', () => P.rasterise(huge, { scale: 3 }, fb.env), RangeError);
    check('C17 no canvas was made for it', fb.log.canvases.length === 0 && !!err && /too large/.test(err.message));
    const okSize = '<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="2000"></svg>';
    const r = await P.rasterise(okSize, { scale: 3 }, fakeBrowser({ pngFor: () => makePng(1, 1) }).env);
    check('C18 6000 x 6000 px (36 M pixels) is inside the limit', r.width === 6000 && r.height === 6000);
  }
  await rejects('C19 no browser at all rejects', () => P.rasterise(svg80, {}, {}), Error);
  check('C20 the largest real screen at 3x is inside the limits', s132.width * 3 <= P.MAX_SIDE && s132.width * s132.height * 9 <= P.MAX_PIXELS);

  // ---- D. the host
  const png = makePng(10, 4);
  const good = { type: 'exportPng', name: 'CUSTMNT', scale: 2, width: 10, height: 4, base64: png.toString('base64') };
  const parsed = P.parseMessage(good);
  check('D1 a good message parses to the bytes', Buffer.compare(parsed.bytes, png) === 0 && parsed.width === 10 && parsed.height === 4 && parsed.scale === 2);
  check('D2 file name has the scale suffix', parsed.fileName === 'CUSTMNT@2x.png');
  check('D3 1x has no suffix', P.parseMessage(Object.assign({}, good, { scale: 1 })).fileName === 'CUSTMNT.png');
  check('D4 width and height are optional', P.parseMessage({ type: 'exportPng', base64: png.toString('base64') }).fileName === 'screen.png');
  const bad = (label, msg, re) => { let err = null; try { P.parseMessage(msg); } catch (e) { err = e; } check(label, !!err && (!re || re.test(err.message))); };
  bad('D5 wrong type', Object.assign({}, good, { type: 'other' }), /Not a PNG export/);
  bad('D6 no message', null, /Not a PNG export/);
  bad('D7 no data', Object.assign({}, good, { base64: '' }), /no picture data/);
  bad('D8 data not a string', Object.assign({}, good, { base64: 12 }), /no picture data/);
  bad('D9 not base64', Object.assign({}, good, { base64: 'abc$%^&' }), /not valid base64/);
  bad('D10 base64 with a wrong length', Object.assign({}, good, { base64: 'abcde' }), /not valid base64/);
  bad('D11 base64 of something else', Object.assign({}, good, { base64: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg> padding padding').toString('base64') }), /not a PNG/);
  bad('D12 width does not match', Object.assign({}, good, { width: 11 }), /does not match/);
  bad('D13 height does not match', Object.assign({}, good, { height: 5 }), /does not match/);
  {
    const tooBig = Buffer.alloc(P.MAX_BYTES + 3, 1).toString('base64');
    bad('D14 over the byte cap', Object.assign({}, good, { base64: tooBig }), /too large/);
    const truncated = png.subarray(0, 20).toString('base64');
    bad('D15 a PNG cut off inside the header', Object.assign({}, good, { base64: truncated }), /not a PNG/);
    const zeroW = Buffer.from(png); zeroW.writeUInt32BE(0, 16);
    bad('D16 a PNG header with width 0', Object.assign({}, good, { base64: zeroW.toString('base64'), width: 0 }), /not a PNG/);
  }
  check('D17 an unknown scale is read as 1x', P.parseMessage(Object.assign({}, good, { scale: 9 })).scale === 1);
  check('D18 readPngSize reads the IHDR', JSON.stringify(P.readPngSize(makePng(300, 7))) === '{"width":300,"height":7}');
  check('D19 readPngSize of text is null', P.readPngSize(Buffer.from('hello world, this is not a png at all....')) === null);

  // file names
  check('D20 path characters are replaced', P.suggestName('a/b\\c:d*e?f"g<h>i|j', 1) === 'a_b_c_d_e_f_g_h_i_j.png');
  check('D21 a name that already ends .png is not doubled', P.suggestName('SCREEN.PNG', 3) === 'SCREEN@3x.png');
  check('D22 empty, dots and control characters fall back to screen', P.suggestName('', 1) === 'screen.png' && P.suggestName('..', 1) === 'screen.png' && P.suggestName('\u0001\u0002', 2) === 'screen@2x.png');
  check('D23 a Windows device name gets an underscore', P.suggestName('CON', 1) === 'CON_.png' && P.suggestName('lpt1', 1) === 'lpt1_.png');
  check('D24 long names are cut to 80 characters', P.suggestName('x'.repeat(200), 1) === 'x'.repeat(80) + '.png');
  check('D25 leading and trailing dots and blanks are dropped', P.suggestName('  .name. ', 1) === 'name.png');
  check('D26 a null name', P.suggestName(null, 1) === 'screen.png');

  // save
  {
    const calls = { dialog: [], writes: [] };
    const api = {
      showSaveDialog: (o) => { calls.dialog.push(o); return Promise.resolve('file:///out/' + 'x.png'); },
      writeFile: (t, b) => { calls.writes.push({ t, b }); return Promise.resolve(); }
    };
    const res = await P.savePng(api, good, { defaultFolder: '/work/docs/' });
    check('D27 saved: result', res.saved === true && res.target === 'file:///out/x.png' && res.fileName === 'CUSTMNT@2x.png' && res.bytes === png.length);
    check('D28 the dialog was offered the name inside the folder (no doubled slash)', calls.dialog[0].defaultPath === '/work/docs/CUSTMNT@2x.png');
    check('D29 the dialog filters to .png', JSON.stringify(calls.dialog[0].filters) === '{"PNG image":["png"]}');
    check('D30 the bytes written are the PNG', calls.writes.length === 1 && Buffer.compare(calls.writes[0].b, png) === 0 && calls.writes[0].t === 'file:///out/x.png');
    const res2 = await P.savePng(api, good);
    check('D31 with no folder the dialog gets the bare file name', calls.dialog[1].defaultPath === 'CUSTMNT@2x.png' && res2.saved);
  }
  {
    let wrote = false;
    const res = await P.savePng({ showSaveDialog: () => Promise.resolve(undefined), writeFile: () => { wrote = true; } }, good);
    check('D32 cancelling the dialog saves nothing', res.saved === false && !wrote);
    let dialog = false;
    await rejects('D33 a bad message rejects before any dialog opens', () => P.savePng({ showSaveDialog: () => { dialog = true; return Promise.resolve('x'); }, writeFile: () => {} }, { type: 'exportPng', base64: 'AAAA' }), Error);
    check('D34 and no dialog was shown', dialog === false);
    const err = await rejects('D35 a failed write rejects with its own error', () => P.savePng({ showSaveDialog: () => Promise.resolve('t'), writeFile: () => Promise.reject(new Error('disk full')) }, good), Error);
    check('D36 the write error is passed on', !!err && err.message === 'disk full');
    const sync = await P.savePng({ showSaveDialog: () => 'file:///sync.png', writeFile: () => undefined }, good);
    check('D37 an api that answers without promises works too', sync.saved === true);
  }

  // ---- E. round trip
  {
    const fb = fakeBrowser();
    const r = await P.rasterise(svg80, { scale: 3 }, fb.env);
    const msg = P.toMessage(r, { name: 'HDRREC' });
    check('E1 the message carries type, name, scale, size, data', msg.type === 'exportPng' && msg.name === 'HDRREC' && msg.scale === 3 && msg.width === r.width && msg.height === r.height && msg.base64 === r.base64);
    check('E2 the message survives JSON (it crosses postMessage)', JSON.stringify(JSON.parse(JSON.stringify(msg))) === JSON.stringify(msg));
    let written = null;
    const saved = await P.savePng({ showSaveDialog: () => Promise.resolve('t'), writeFile: (t, b) => { written = b; } }, JSON.parse(JSON.stringify(msg)));
    check('E3 the host writes exactly the canvas bytes, named HDRREC@3x.png', saved.fileName === 'HDRREC@3x.png' && Buffer.compare(written, Buffer.from(r.base64, 'base64')) === 0);
    check('E4 toMessage without a name has an empty name (the host falls back to "screen")', P.toMessage(r).name === '' && P.parseMessage(P.toMessage(r)).fileName === 'screen@3x.png');
    check('E5 toMessage of a non-result is a TypeError', (() => { try { P.toMessage({}); } catch (e) { return e instanceof TypeError; } return false; })());
  }

  // ---- F. the module itself
  {
    const src = fs.readFileSync(path.join(__dirname, '../screenPng.js'), 'utf8');
    check('F1 no vscode import', !/require\(['"]vscode['"]\)/.test(src));
    check('F2 no remote URL or script in the module', !/https?:\/\//.test(src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/www\.w3\.org\/2000\/svg/g, '')));
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf8'));
    check('F3 screenPng.js is in the dist copy list', /'screenPng\.js'/.test(pkg.scripts['build:webview-assets']));
    check('F4 the dist copy equals the source', fs.readFileSync(path.join(__dirname, '../../dist/screenPng.js'), 'utf8') === src);
  }
}

main().then(() => process.exit(failureCount() === 0 ? 0 : 1), (err) => { console.log('FAIL  - unexpected error:', err && err.stack || err); process.exit(1); });

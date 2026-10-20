/**
 * screenPng.js - E5c: the E5b SVG as a PNG.
 *
 * Two halves in one UMD module, because they are two ends of one message:
 *
 *   WEBVIEW (needs a browser canvas, so it can only run where the preview runs):
 *     var r = await ScreenPng.rasterise(ScreenExport.buildSvg(screen, opts), { scale: 2 });
 *     vscode.postMessage(ScreenPng.toMessage(r, { name: 'CUSTMNT' }));
 *
 *   EXTENSION HOST (no DOM, no vscode import; the two vscode calls are handed in):
 *     var saved = await ScreenPng.savePng({ showSaveDialog: ..., writeFile: ... }, msg, { defaultFolder });
 *
 * Decisions (E5a, roadmap): scale 1x, 2x or 3x, default 2x; the webview draws, the host only checks and saves the bytes.
 * Nothing in the designers calls this yet: the command, toolbar button, save dialog wiring and clipboard are E5e.
 *
 * The SVG is drawn to the canvas at its final size (not drawn small and stretched), so a browser rasterises the vector at 2x / 3x and the
 * text stays sharp. The SVG carries no remote asset, so the canvas is never tainted and `toDataURL` is allowed.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ScreenPng = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SCALES = [1, 2, 3];
  var DEFAULT_SCALE = 2;
  // Browsers refuse or silently blank a canvas past these (Chromium: 16384 on a side, about 268M pixels; Safari and mobile are lower).
  var MAX_SIDE = 16384;
  var MAX_PIXELS = 64 * 1024 * 1024;
  // The host refuses a message past this many decoded bytes (a 132 x 27 screen at 3x is a few hundred KB).
  var MAX_BYTES = 32 * 1024 * 1024;
  var LOAD_TIMEOUT_MS = 15000;
  var MESSAGE_TYPE = 'exportPng';
  var PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

  /** 1, 2, 3, '2' or '2x' to 1 / 2 / 3; nothing given is the default; anything else is a RangeError (a setting must not pick a size silently). */
  function normaliseScale(value) {
    if (value === undefined || value === null || value === '') return DEFAULT_SCALE;
    var n = typeof value === 'number' ? value : (/^([123])x?$/i.test(String(value).trim()) ? Number(/^([123])/.exec(String(value).trim())[1]) : NaN);
    if (SCALES.indexOf(n) < 0) throw new RangeError('PNG scale must be 1, 2 or 3 (got ' + String(value) + ')');
    return n;
  }

  /** The drawing's size in pixels, read from the root element's width and height (what ScreenExport.buildSvg writes). */
  function svgSize(svg) {
    if (typeof svg !== 'string') throw new TypeError('svg must be a string');
    var tag = /<svg\b[^>]*>/i.exec(svg);
    var w = tag && /\swidth="(\d+(?:\.\d+)?)"/.exec(tag[0]);
    var h = tag && /\sheight="(\d+(?:\.\d+)?)"/.exec(tag[0]);
    if (!w || !h) throw new TypeError('svg has no width and height');
    var width = Number(w[1]);
    var height = Number(h[1]);
    if (!(width > 0) || !(height > 0)) throw new TypeError('svg has an empty size');
    return { width: width, height: height };
  }

  /** A data: URL for the image element. Percent-encoded text, not base64, so no Blob or object URL has to be created and revoked. */
  function svgToDataUrl(svg) {
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  function checkCanvasSize(width, height, scale) {
    var w = Math.round(width * scale);
    var h = Math.round(height * scale);
    if (w > MAX_SIDE || h > MAX_SIDE || w * h > MAX_PIXELS) {
      throw new RangeError('A ' + w + ' x ' + h + ' px picture is too large for a browser canvas; use a smaller scale');
    }
    return { width: w, height: h };
  }

  /**
   * Draw `svg` to a canvas and return the PNG. Resolves `{ base64, width, height, scale }` (width and height are the PNG's pixels).
   * `env` (tests) replaces the browser: `{ document, Image, setTimeout, clearTimeout }`; by default the page's own.
   */
  function rasterise(svg, opts, env) {
    return new Promise(function (resolve, reject) {
      var scale, size, out;
      try {
        scale = normaliseScale(opts && opts.scale);
        size = svgSize(svg);
        out = checkCanvasSize(size.width, size.height, scale);
      } catch (err) { reject(err); return; }
      var e = env || {};
      var doc = e.document || (typeof document !== 'undefined' ? document : null);
      var ImageCtor = e.Image || (typeof Image !== 'undefined' ? Image : null);
      var setT = e.setTimeout || (typeof setTimeout !== 'undefined' ? setTimeout : null);
      var clearT = e.clearTimeout || (typeof clearTimeout !== 'undefined' ? clearTimeout : null);
      if (!doc || !ImageCtor) { reject(new Error('A browser canvas is needed to draw a PNG')); return; }

      var img = new ImageCtor();
      var timer = null;
      var done = false;
      function finish(err, value) {
        if (done) return;
        done = true;
        if (timer !== null && clearT) clearT(timer);
        if (err) reject(err); else resolve(value);
      }
      img.onload = function () {
        try {
          var canvas = doc.createElement('canvas');
          canvas.width = out.width;
          canvas.height = out.height;
          var ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('The browser gave no 2D canvas');
          ctx.drawImage(img, 0, 0, out.width, out.height);
          var url = canvas.toDataURL('image/png');
          var prefix = 'data:image/png;base64,';
          if (typeof url !== 'string' || url.indexOf(prefix) !== 0 || url.length === prefix.length) {
            throw new Error('The browser could not encode the picture as PNG');
          }
          finish(null, { base64: url.slice(prefix.length), width: out.width, height: out.height, scale: scale });
        } catch (err) { finish(err); }
      };
      img.onerror = function () { finish(new Error('The browser could not load the screen drawing as an image')); };
      if (setT) timer = setT(function () { finish(new Error('Drawing the screen as an image took too long')); }, (opts && opts.timeoutMs) || LOAD_TIMEOUT_MS);
      img.src = svgToDataUrl(svg);
    });
  }

  /** What the webview posts to the host. */
  function toMessage(result, opts) {
    if (!result || typeof result.base64 !== 'string') throw new TypeError('result must come from rasterise()');
    return { type: MESSAGE_TYPE, name: opts && opts.name != null ? String(opts.name) : '', scale: result.scale, width: result.width, height: result.height, base64: result.base64 };
  }

  // ---------------------------------------------------------------- host half

  /** Width and height from a PNG's IHDR, or null when the bytes are not a PNG. */
  function readPngSize(bytes) {
    if (!bytes || bytes.length < 33) return null;
    for (var i = 0; i < PNG_SIGNATURE.length; i++) if (bytes[i] !== PNG_SIGNATURE[i]) return null;
    // chunk length (4), type 'IHDR' (4), width (4), height (4)
    if (bytes[12] !== 0x49 || bytes[13] !== 0x48 || bytes[14] !== 0x44 || bytes[15] !== 0x52) return null;
    var width = ((bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19]) >>> 0;
    var height = ((bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23]) >>> 0;
    if (!width || !height) return null;
    return { width: width, height: height };
  }

  /** A file name that is safe on Windows, macOS and Linux: no path, no reserved characters, 1x plain, 2x / 3x with an `@2x` / `@3x` suffix. */
  function suggestName(name, scale) {
    var base = String(name == null ? '' : name)
      .replace(/[\u0000-\u001F]/g, '')
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/\.png$/i, '')
      .replace(/^[\s.]+|[\s.]+$/g, '');
    if (base.length > 80) base = base.slice(0, 80).replace(/[\s.]+$/, '');
    if (!base) base = 'screen';
    if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(base)) base = base + '_';
    var s = SCALES.indexOf(scale) >= 0 ? scale : 1;
    return base + (s > 1 ? '@' + s + 'x' : '') + '.png';
  }

  /** Check a webview message and return `{ bytes, width, height, scale, fileName }`. Throws an Error with a message fit for the user. */
  function parseMessage(msg) {
    if (!msg || msg.type !== MESSAGE_TYPE) throw new Error('Not a PNG export message');
    if (typeof msg.base64 !== 'string' || !msg.base64) throw new Error('The PNG export has no picture data');
    if (msg.base64.length > Math.ceil(MAX_BYTES / 3) * 4 + 4) throw new Error('The PNG export is too large to save');
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(msg.base64) || msg.base64.length % 4 !== 0) throw new Error('The PNG export data is not valid base64');
    var bytes = Buffer.from(msg.base64, 'base64');
    if (bytes.length > MAX_BYTES) throw new Error('The PNG export is too large to save');
    var size = readPngSize(bytes);
    if (!size) throw new Error('The PNG export data is not a PNG picture');
    if ((msg.width != null && msg.width !== size.width) || (msg.height != null && msg.height !== size.height)) {
      throw new Error('The PNG export size does not match its picture');
    }
    var scale = SCALES.indexOf(msg.scale) >= 0 ? msg.scale : 1;
    return { bytes: bytes, width: size.width, height: size.height, scale: scale, fileName: suggestName(msg.name, scale) };
  }

  /**
   * Ask where to save and write the bytes. `api.showSaveDialog(options)` resolves a target or undefined (cancelled);
   * `api.writeFile(target, bytes)` writes it. The caller passes the two vscode calls (E5e), so this stays testable without vscode.
   * Resolves `{ saved: true, target, fileName, bytes }` or `{ saved: false }`.
   */
  function savePng(api, msg, opts) {
    return Promise.resolve().then(function () {
      var parsed = parseMessage(msg);
      var folder = opts && opts.defaultFolder;
      var defaultPath = folder ? String(folder).replace(/[\\/]+$/, '') + '/' + parsed.fileName : parsed.fileName;
      return Promise.resolve(api.showSaveDialog({ defaultPath: defaultPath, filters: { 'PNG image': ['png'] }, saveLabel: 'Save PNG' })).then(function (target) {
        if (!target) return { saved: false };
        return Promise.resolve(api.writeFile(target, parsed.bytes)).then(function () {
          return { saved: true, target: target, fileName: parsed.fileName, bytes: parsed.bytes.length };
        });
      });
    });
  }

  return {
    rasterise: rasterise,
    toMessage: toMessage,
    parseMessage: parseMessage,
    savePng: savePng,
    normaliseScale: normaliseScale,
    svgSize: svgSize,
    svgToDataUrl: svgToDataUrl,
    readPngSize: readPngSize,
    suggestName: suggestName,
    SCALES: SCALES,
    DEFAULT_SCALE: DEFAULT_SCALE,
    MESSAGE_TYPE: MESSAGE_TYPE,
    MAX_SIDE: MAX_SIDE,
    MAX_PIXELS: MAX_PIXELS,
    MAX_BYTES: MAX_BYTES
  };
});

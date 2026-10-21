/**
 * screenExportUi.js - E5e: the command, toolbar button, save dialog and clipboard for the screen preview export.
 *
 * It joins the three building blocks (E5b screenExport.js = SVG and HTML, E5c screenPng.js = PNG, E5d screenText.js = text) to the
 * two designers. Three small parts in one UMD module, because they are the two ends of one message:
 *
 *   SETTINGS (both ends)
 *     ScreenExportUi.readSettings(get)         isda.export.* -> { defaultFormat, pngScale, ruler, textStyle }, every value checked
 *
 *   WEBVIEW (needs the page, so it runs where the preview runs; builds the file, the host saves it)
 *     ScreenExportUi.controlsHtml(prefix)      the Export button and its "more" list, as markup
 *     ScreenExportUi.createController(env)     wires one or more copies of the controls and answers the host's request
 *
 *   EXTENSION HOST (no DOM, no vscode import; the vscode calls are handed in)
 *     ScreenExportUi.parseMessage(msg)         checks an exportScreen message
 *     ScreenExportUi.handleMessage(api, msg)   asks where to save and writes it, or puts the text on the clipboard
 *
 * Decisions (Warrior, E5e):
 *   - The toolbar button saves in the default format (isda.export.defaultFormat); the list beside it picks another format or Copy.
 *   - Copy puts PNG on the clipboard as an image and SVG, HTML and Text as text. When the page refuses an image copy, the controller
 *     falls back to a save and says so.
 *   - Four settings: isda.export.defaultFormat (png | svg | html | text), isda.export.pngScale (1 | 2 | 3, default 2),
 *     isda.export.ruler (default off), isda.export.textStyle (unicode | ascii, default unicode).
 *   - The command exports the active designer's current record in its current indicator state, in the default format.
 *
 * Nothing here reads the engine; the screen is whatever the designer last drew (its resolveScreen result).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./screenExport.js'), require('./screenPng.js'), require('./screenText.js'));
  } else {
    root.ScreenExportUi = factory(root.ScreenExport, root.ScreenPng, root.ScreenText);
  }
})(typeof self !== 'undefined' ? self : this, function (ScreenExport, ScreenPng, ScreenText) {
  'use strict';

  var FORMATS = ['png', 'svg', 'html', 'text'];
  var ACTIONS = ['save', 'copy'];
  var DEFAULT_FORMAT = 'png';
  var TEXT_STYLES = ['unicode', 'ascii'];
  var MESSAGE_TYPE = 'exportScreen';
  var REQUEST_TYPE = 'exportScreenRequest';
  var SETTINGS_TYPE = 'exportSettings';
  // A text export past this many characters is refused by the host (a 132 x 27 screen as SVG is well under a megabyte).
  var MAX_TEXT = 8 * 1024 * 1024;
  var FORMAT_LABELS = { png: 'PNG image', svg: 'SVG', html: 'HTML page', text: 'Plain text' };
  var EXTENSIONS = { png: 'png', svg: 'svg', html: 'html', text: 'txt' };
  var MIME = { png: 'image/png', svg: 'image/svg+xml', html: 'text/html', text: 'text/plain' };

  // ---------------------------------------------------------------- settings

  /** The four isda.export.* settings, each checked; a value that is not one of the choices falls back to its default. */
  function readSettings(get) {
    var read = typeof get === 'function' ? get : function (_key, fallback) { return fallback; };
    var format = String(read('defaultFormat', DEFAULT_FORMAT));
    var scale = Number(read('pngScale', ScreenPng.DEFAULT_SCALE));
    var style = String(read('textStyle', 'unicode'));
    return {
      defaultFormat: FORMATS.indexOf(format) >= 0 ? format : DEFAULT_FORMAT,
      pngScale: ScreenPng.SCALES.indexOf(scale) >= 0 ? scale : ScreenPng.DEFAULT_SCALE,
      ruler: read('ruler', false) === true,
      textStyle: TEXT_STYLES.indexOf(style) >= 0 ? style : 'unicode'
    };
  }

  // ---------------------------------------------------------------- file names

  /** A file name that is safe on Windows, macOS and Linux, with the extension of the format (PNG keeps its @2x / @3x suffix). */
  function suggestFileName(name, format, scale) {
    if (format === 'png') return ScreenPng.suggestName(name, scale);
    var ext = EXTENSIONS[format] || 'txt';
    var base = String(name == null ? '' : name)
      .replace(/[\u0000-\u001F]/g, '')
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/\.(svg|html?|txt)$/i, '')
      .replace(/^[\s.]+|[\s.]+$/g, '');
    if (base.length > 80) base = base.slice(0, 80).replace(/[\s.]+$/, '');
    if (!base) base = 'screen';
    if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(base)) base = base + '_';
    return base + '.' + ext;
  }

  // ---------------------------------------------------------------- webview half

  var CONTROL_IDS = { button: 'ExportBtn', more: 'ExportMore' };

  function escAttr(s) { return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  /**
   * The Export button and its list of other formats, as markup. `prefix` makes the ids unique when the page holds two copies
   * (the DSPF designer has one in the side panel for the classic style and one in the pinned toolbar for the modern one).
   */
  function controlsHtml(prefix) {
    var p = prefix || '';
    var opts = '<option value="">More…</option>';
    FORMATS.forEach(function (f) { opts += '<option value="save:' + f + '">Save as ' + escAttr(FORMAT_LABELS[f]) + '</option>'; });
    opts += '<option value="copy:png">Copy as image (PNG)</option>';
    FORMATS.slice(1).forEach(function (f) { opts += '<option value="copy:' + f + '">Copy ' + escAttr(FORMAT_LABELS[f]) + '</option>'; });
    return '<div class="export-group" data-export-group="' + escAttr(p) + '">' +
      '<button type="button" class="secondary export-btn" id="' + escAttr(p + CONTROL_IDS.button) + '" title="Save the screen as drawn now (current record, current indicators) in the default format">Export screen</button>' +
      '<select class="export-more" id="' + escAttr(p + CONTROL_IDS.more) + '" aria-label="Export screen as" title="Save in another format, or copy to the clipboard">' + opts + '</select>' +
      '</div>';
  }

  /** The colours of the page's own theme, read from the computed style; a value that is not a colour is dropped by the serialiser. */
  function readTheme(win, doc) {
    var theme = {};
    try {
      var style = win.getComputedStyle(doc.body);
      var map = { accent: '--accent', inkDim: '--ink-dim', warn: '--warn' };
      Object.keys(map).forEach(function (k) {
        var v = String(style.getPropertyValue(map[k]) || '').trim();
        if (v) theme[k] = v;
      });
    } catch (e) { /* the serialiser's classic colours stand */ }
    return theme;
  }

  /** Build what the format asks for from a resolved screen. Resolves { format, name, mime, text } or, for PNG, { png: <exportPng message> }. */
  function buildArtifact(screen, opts) {
    return Promise.resolve().then(function () {
      if (!screen || typeof screen !== 'object') throw new Error('Nothing to export: there is no screen drawn yet.');
      if (screen.error) throw new Error('Nothing to export: ' + screen.error);
      var o = opts || {};
      var format = FORMATS.indexOf(o.format) >= 0 ? o.format : DEFAULT_FORMAT;
      var settings = readSettings(function (k, d) { return o.settings && o.settings[k] !== undefined ? o.settings[k] : d; });
      var name = o.name != null ? String(o.name) : (screen.recordName || 'screen');
      var drawOpts = { theme: o.theme || {}, ruler: settings.ruler, title: name };
      if (format === 'svg') return { format: format, name: name, mime: MIME.svg, text: ScreenExport.buildSvg(screen, drawOpts) };
      if (format === 'html') return { format: format, name: name, mime: MIME.html, text: ScreenExport.buildHtml(screen, drawOpts) };
      if (format === 'text') {
        return { format: format, name: name, mime: MIME.text, text: ScreenText.buildText(screen, { ruler: settings.ruler, ascii: settings.textStyle === 'ascii', header: true, title: name }) };
      }
      return ScreenPng.rasterise(ScreenExport.buildSvg(screen, drawOpts), { scale: settings.pngScale }, o.env).then(function (r) {
        return { format: format, name: name, mime: MIME.png, png: ScreenPng.toMessage(r, { name: name }) };
      });
    });
  }

  function base64ToBlob(base64, mime, env) {
    var atobFn = (env && env.atob) || (typeof atob !== 'undefined' ? atob : null);
    var BlobCtor = (env && env.Blob) || (typeof Blob !== 'undefined' ? Blob : null);
    if (!atobFn || !BlobCtor) throw new Error('The page cannot copy an image');
    var bin = atobFn(base64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new BlobCtor([bytes], { type: mime });
  }

  /**
   * The webview's end. `env`: { document, window, postMessage(msg), getScreen() -> the screen last drawn, getName() -> file name base,
   * clipboard? (default navigator.clipboard), ClipboardItem?, atob?, Blob?, imageEnv? (the canvas env for the PNG, tests only) }.
   * Call attach(prefix) for each copy of the controls, applySettings(msg) when the host sends exportSettings, and
   * handleRequest(msg) when the host sends exportScreenRequest (the command).
   */
  function createController(env) {
    var settings = readSettings();
    var busy = false;

    function theme() { return env.window && env.document ? readTheme(env.window, env.document) : {}; }

    function fail(message) { env.postMessage({ type: 'error', message: message }); }

    function run(format, action) {
      if (busy) return Promise.resolve({ ok: false, reason: 'busy' });
      busy = true;
      return buildArtifact(env.getScreen(), { format: format, settings: settings, theme: theme(), name: env.getName(), env: env.imageEnv })
        .then(function (artifact) {
          if (action === 'copy') return copyArtifact(artifact);
          return sendArtifact(artifact, 'save');
        })
        .catch(function (err) {
          fail(err && err.message ? err.message : String(err));
          return { ok: false, reason: 'error' };
        })
        .then(function (res) { busy = false; return res; });
    }

    function sendArtifact(artifact, action, notice) {
      var msg = { type: MESSAGE_TYPE, format: artifact.format, action: action, name: artifact.name };
      if (artifact.png) { msg.png = artifact.png; } else { msg.text = artifact.text; }
      if (notice) msg.notice = notice;
      env.postMessage(msg);
      return { ok: true, action: action, format: artifact.format };
    }

    function copyArtifact(artifact) {
      if (!artifact.png) return sendArtifact(artifact, 'copy');
      // An image copy is the page's own call (the host has no image clipboard); a refusal becomes a save, with a note.
      var clipboard = env.clipboard || (typeof navigator !== 'undefined' ? navigator.clipboard : null);
      var ClipItem = env.ClipboardItem || (typeof ClipboardItem !== 'undefined' ? ClipboardItem : null);
      var fallback = function () {
        return sendArtifact(artifact, 'save', 'The page could not copy the image to the clipboard, so it is saved as a file instead.');
      };
      if (!clipboard || typeof clipboard.write !== 'function' || !ClipItem) return Promise.resolve(fallback());
      return Promise.resolve().then(function () {
        var blob = base64ToBlob(artifact.png.base64, MIME.png, env);
        var item = {};
        item[MIME.png] = blob;
        return clipboard.write([new ClipItem(item)]);
      }).then(function () {
        env.postMessage({ type: MESSAGE_TYPE, format: 'png', action: 'copied', name: artifact.name });
        return { ok: true, action: 'copied', format: 'png' };
      }, fallback);
    }

    function onMore(select) {
      var value = select.value;
      select.value = '';
      var parts = String(value).split(':');
      if (parts.length !== 2 || ACTIONS.indexOf(parts[0]) < 0 || FORMATS.indexOf(parts[1]) < 0) return;
      void run(parts[1], parts[0]);
    }

    function attach(prefix) {
      var p = prefix || '';
      var button = env.document.getElementById(p + CONTROL_IDS.button);
      var more = env.document.getElementById(p + CONTROL_IDS.more);
      if (button) button.addEventListener('click', function () { void run(settings.defaultFormat, 'save'); });
      if (more) more.addEventListener('change', function () { onMore(more); });
      return { button: button, more: more };
    }

    return {
      attach: attach,
      run: run,
      applySettings: function (msg) { settings = readSettings(function (k, d) { return msg && msg[k] !== undefined ? msg[k] : d; }); return settings; },
      getSettings: function () { return settings; },
      handleRequest: function (msg) {
        var format = msg && FORMATS.indexOf(msg.format) >= 0 ? msg.format : settings.defaultFormat;
        var action = msg && ACTIONS.indexOf(msg.action) >= 0 ? msg.action : 'save';
        return run(format, action);
      }
    };
  }

  // ---------------------------------------------------------------- host half

  /** Check an exportScreen message from a webview. Returns { format, action, fileName, text?, png? }; throws an Error fit for the user. */
  function parseMessage(msg) {
    if (!msg || msg.type !== MESSAGE_TYPE) throw new Error('Not a screen export message');
    if (FORMATS.indexOf(msg.format) < 0) throw new Error('Unknown export format');
    if (ACTIONS.concat(['copied']).indexOf(msg.action) < 0) throw new Error('Unknown export action');
    var name = msg.name != null ? String(msg.name) : '';
    var notice = typeof msg.notice === 'string' ? msg.notice.slice(0, 300) : '';
    if (msg.action === 'copied') {
      if (msg.format !== 'png') throw new Error('Only an image copy is reported by the page');
      return { format: msg.format, action: 'copied', fileName: suggestFileName(name, 'png', 1), notice: notice };
    }
    if (msg.format === 'png') {
      var png = ScreenPng.parseMessage(msg.png);
      return { format: 'png', action: msg.action === 'copy' ? 'save' : msg.action, fileName: png.fileName, png: msg.png, notice: notice };
    }
    if (typeof msg.text !== 'string' || !msg.text) throw new Error('The export has no content');
    if (msg.text.length > MAX_TEXT) throw new Error('The export is too large to save');
    return { format: msg.format, action: msg.action, fileName: suggestFileName(name, msg.format, 1), text: msg.text, notice: notice };
  }

  /**
   * Put the member's own name in front of the record name the page sent (CUSTMNT.dspf + HDRREC -> CUSTMNT-HDRREC), in the message and in
   * its PNG part, so the suggested file name says both. Returns a copy; a message that is not an object comes back unchanged.
   */
  function withFileBase(msg, base) {
    if (!msg || typeof msg !== 'object') return msg;
    var b = String(base == null ? '' : base).replace(/\.[^.\\/]*$/, '');
    var join = function (name) { var n = name == null ? '' : String(name); return b && n ? b + '-' + n : (b || n); };
    var out = Object.assign({}, msg, { name: join(msg.name) });
    if (msg.png && typeof msg.png === 'object') out.png = Object.assign({}, msg.png, { name: join(msg.png.name != null ? msg.png.name : msg.name) });
    return out;
  }

  /**
   * Do what the page asked. `api`: { showSaveDialog(options), writeFile(target, bytes), writeClipboardText(text) }, all handed in by the
   * extension so this stays testable without vscode. `opts.defaultFolder` is where the dialog opens.
   * Resolves { done: 'saved', target, fileName, format, notice } | { done: 'copied', format } | { done: 'cancelled' }.
   */
  function handleMessage(api, msg, opts) {
    return Promise.resolve().then(function () {
      var parsed = parseMessage(msg);
      if (parsed.action === 'copied') return { done: 'copied', format: 'png', notice: parsed.notice };
      if (parsed.action === 'copy') {
        return Promise.resolve(api.writeClipboardText(parsed.text)).then(function () { return { done: 'copied', format: parsed.format }; });
      }
      var folder = opts && opts.defaultFolder;
      var defaultPath = folder ? String(folder).replace(/[\\/]+$/, '') + '/' + parsed.fileName : parsed.fileName;
      var filters = {};
      filters[FORMAT_LABELS[parsed.format]] = [EXTENSIONS[parsed.format]];
      var write = parsed.format === 'png'
        ? function (target) { return api.writeFile(target, ScreenPng.parseMessage(parsed.png).bytes); }
        : function (target) { return api.writeFile(target, Buffer.from(parsed.text, 'utf8')); };
      return Promise.resolve(api.showSaveDialog({ defaultPath: defaultPath, filters: filters, saveLabel: 'Save ' + FORMAT_LABELS[parsed.format] })).then(function (target) {
        if (!target) return { done: 'cancelled' };
        return Promise.resolve(write(target)).then(function () {
          return { done: 'saved', target: target, fileName: parsed.fileName, format: parsed.format, notice: parsed.notice };
        });
      });
    });
  }

  return {
    FORMATS: FORMATS,
    ACTIONS: ACTIONS,
    DEFAULT_FORMAT: DEFAULT_FORMAT,
    TEXT_STYLES: TEXT_STYLES,
    FORMAT_LABELS: FORMAT_LABELS,
    EXTENSIONS: EXTENSIONS,
    MIME: MIME,
    MESSAGE_TYPE: MESSAGE_TYPE,
    REQUEST_TYPE: REQUEST_TYPE,
    SETTINGS_TYPE: SETTINGS_TYPE,
    MAX_TEXT: MAX_TEXT,
    readSettings: readSettings,
    suggestFileName: suggestFileName,
    controlsHtml: controlsHtml,
    readTheme: readTheme,
    buildArtifact: buildArtifact,
    createController: createController,
    parseMessage: parseMessage,
    withFileBase: withFileBase,
    handleMessage: handleMessage
  };
});

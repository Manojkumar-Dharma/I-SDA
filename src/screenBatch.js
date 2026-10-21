/**
 * screenBatch.js - E5f: every record and every DSPSIZ of a display file as SVG, HTML and text, into one folder with an index page.
 *
 * Pure, no vscode and no DOM: the extension host parses the source, hands the model to prepare(), and run() writes the files through
 * the two calls it is given. Nothing needs an open webview (PNG does, so the batch leaves it out; E5f decision).
 *
 *   var plan = ScreenBatch.prepare(model, { engine: DspfEngine, memberName: 'CUSTMNT.dspf', themeName: 'amber', ruler: false, textStyle: 'unicode' });
 *   var res = await ScreenBatch.run(plan, { createDirectory: ..., writeFile: ... }, { isCancelled: ..., onProgress: ... });
 *
 * Decisions (Warrior, E5f):
 *   - Formats: SVG, HTML and plain text, one file each per record and per DSPSIZ size. No PNG.
 *   - Indicator state: every indicator off. A record whose own record-level condition needs an indicator (A  10  R REC) is drawn with
 *     that indicator on, and the index says so; a record that is not shown at a size (a *DS3 / *DS4 condition) is listed as skipped
 *     for that size, with the reason, and gets no files.
 *   - Layout: RECORD-LINESxCOLUMNS.svg / .html / .txt for every record and size (HDRREC-24x80.svg), and index.html linking them.
 *   - The screen designer's own state (stored values, message texts, resolved REFFLD fields) is not available here, so those are
 *     drawn as the designer draws them before they are known. The text dump has no legend (E5d default off).
 *
 * The folder is named MEMBER-screens. Names are made safe for Windows, macOS and Linux and never collide (compared without case).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./screenExport.js'), require('./screenText.js'));
  } else {
    root.ScreenBatch = factory(root.ScreenExport, root.ScreenText);
  }
})(typeof self !== 'undefined' ? self : this, function (ScreenExport, ScreenText) {
  'use strict';

  var FORMATS = ['svg', 'html', 'txt'];
  var FORMAT_LABELS = { svg: 'SVG', html: 'HTML', txt: 'Text' };
  // The accent of each UI theme (the screen's default field colour); the classic green when the name is not one of them.
  var THEME_ACCENTS = { green: '#33ff66', amber: '#ffb347', cyan: '#33d9ff', violet: '#b366ff', white: '#f2f6f4' };
  var INDEX_NAME = 'index.html';
  var MAX_ENTRIES = 5000;

  function themeFor(name) {
    var key = String(name == null ? '' : name).toLowerCase();
    return { accent: Object.prototype.hasOwnProperty.call(THEME_ACCENTS, key) ? THEME_ACCENTS[key] : THEME_ACCENTS.green };
  }

  /** A name part that is safe in a file name on every system. */
  function safePart(text, fallback) {
    var s = String(text == null ? '' : text).replace(/[\u0000-\u001F]/g, '').replace(/[^A-Za-z0-9._@#$-]/g, '_').replace(/^[\s.]+|[\s.]+$/g, '');
    if (s.length > 60) s = s.slice(0, 60);
    if (!s) s = fallback || 'screen';
    if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(s)) s = s + '_';
    return s;
  }

  /** The folder name for a member: MEMBER-screens (the member's extension is dropped). */
  function folderName(memberName) {
    var base = String(memberName == null ? '' : memberName).replace(/^.*[\\/]/, '').replace(/\.[^.]*$/, '');
    return safePart(base, 'display-file') + '-screens';
  }

  function escHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function kindOf(engine, record) {
    var kw = (record.keywords || []).map(function (k) { return k.name; });
    if (kw.indexOf('PULLDOWN') >= 0) return 'Pull-down';
    if (kw.indexOf('WINDOW') >= 0) return 'Window';
    if (kw.indexOf('SFLCTL') >= 0) return 'Subfile control';
    if (kw.indexOf('SFL') >= 0) return 'Subfile';
    if (kw.indexOf('USRDFN') >= 0) return 'User-defined';
    return 'Record';
  }

  /**
   * Resolve one record at one size with every indicator off; when the record's own record-level condition needs indicators, try each
   * group with its non-negated indicators on. Returns { screen, indicators } or { skipped: reason }.
   */
  function resolveOne(engine, model, record, sizeIndex) {
    var empty = new Set();
    var first = engine.resolveScreen(model, record.name, empty, null, false, sizeIndex);
    if (first.error) return { skipped: first.error };
    if (!first.suppressed) return { screen: first, indicators: [] };
    var groups = record.conditions || [];
    for (var i = 0; i < groups.length; i++) {
      var g = groups[i];
      if (g.displaySizeCondition || !g.indicators) continue;
      var on = g.indicators.filter(function (x) { return !x.not; }).map(function (x) { return x.number; });
      if (!on.length) continue;
      var tried = engine.resolveScreen(model, record.name, new Set(on), null, false, sizeIndex);
      if (!tried.error && !tried.suppressed) return { screen: tried, indicators: on };
    }
    return { skipped: 'not shown at this display size, or only under a condition the batch cannot switch on' };
  }

  /**
   * Plan the batch. Returns { folder, sizes, entries, total, themeName } where each entry is
   *   { record, kind, size: { index, name, lines, columns }, base, status: 'ok' | 'skipped', reason?, indicators, empty, files: [names] }
   * and carries a render() that builds its files. Nothing is written here.
   */
  function prepare(model, opts) {
    var o = opts || {};
    var engine = o.engine;
    if (!engine || typeof engine.resolveScreen !== 'function') throw new TypeError('prepare needs the DspfEngine');
    if (!model || !Array.isArray(model.records)) throw new TypeError('prepare needs a parsed display file');
    var sizes = engine.availableScreenSizes(model).map(function (s, i) {
      return { index: i, name: s.name || null, lines: s.lines, columns: s.columns };
    });
    if (!sizes.length) sizes = [{ index: 0, name: null, lines: 24, columns: 80 }];
    if (model.records.length * sizes.length > MAX_ENTRIES) throw new RangeError('Too many screens to export in one batch (' + model.records.length * sizes.length + ')');
    var theme = themeFor(o.themeName);
    var drawOpts = function (title) { return { theme: theme, ruler: !!o.ruler, title: title }; };
    var taken = Object.create(null);
    var unique = function (base) {
      var name = base, n = 2;
      while (taken[name.toLowerCase()]) { name = base + '-' + n; n++; }
      taken[name.toLowerCase()] = true;
      return name;
    };
    taken[INDEX_NAME.replace(/\.html$/, '').toLowerCase()] = true;

    var entries = [];
    model.records.forEach(function (record) {
      sizes.forEach(function (size) {
        var res = resolveOne(engine, model, record, size.index);
        var entry = { record: record.name, kind: kindOf(engine, record), size: size, status: 'ok', indicators: [], empty: false, files: [], base: '' };
        if (res.skipped) {
          entry.status = 'skipped';
          entry.reason = res.skipped;
        } else {
          entry.indicators = res.indicators;
          entry.empty = !res.screen.fields || res.screen.fields.length === 0;
          entry.base = unique(safePart(record.name, 'record') + '-' + size.lines + 'x' + size.columns);
          entry.files = FORMATS.map(function (f) { return entry.base + '.' + f; });
          var screen = res.screen;
          entry.render = function () {
            var title = record.name + ' (' + size.lines + ' x ' + size.columns + ')';
            return [
              { name: entry.base + '.svg', content: ScreenExport.buildSvg(screen, drawOpts(title)) },
              { name: entry.base + '.html', content: ScreenExport.buildHtml(screen, drawOpts(title)) },
              { name: entry.base + '.txt', content: ScreenText.buildText(screen, { ruler: !!o.ruler, ascii: o.textStyle === 'ascii', header: true, title: title }) }
            ];
          };
        }
        entries.push(entry);
      });
    });
    return {
      folder: folderName(o.memberName),
      member: String(o.memberName == null ? '' : o.memberName).replace(/^.*[\\/]/, ''),
      sizes: sizes,
      entries: entries,
      total: entries.filter(function (e) { return e.status === 'ok'; }).length * FORMATS.length + 1,
      themeName: o.themeName || 'green',
      ruler: !!o.ruler
    };
  }

  /** The index page: every record, every size, a thumbnail and the links; skipped screens with their reason. No script, no remote file. */
  function buildIndex(plan, results) {
    var written = results && results.written ? results.written : null;
    var has = function (name) { return !written || written.indexOf(name) >= 0; };
    var byRecord = [];
    var seen = Object.create(null);
    plan.entries.forEach(function (e) {
      if (!seen[e.record]) { seen[e.record] = { record: e.record, kind: e.kind, rows: [] }; byRecord.push(seen[e.record]); }
      seen[e.record].rows.push(e);
    });
    var out = [];
    out.push('<!doctype html>');
    out.push('<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">');
    out.push('<title>Screen previews: ' + escHtml(plan.member) + '</title>');
    out.push('<style>body{margin:0;padding:24px;background:#0b0f0d;color:#cfe8d8;font:14px/1.5 ui-monospace,Menlo,Consolas,monospace}h1{font-size:18px;margin:0 0 4px}h2{font-size:15px;margin:28px 0 6px;border-bottom:1px solid #23312b;padding-bottom:4px}.sub{color:#6f8c7d;margin:0 0 16px}.kind{color:#6f8c7d;font-weight:normal;font-size:12px;margin-left:8px}.shot{display:inline-block;vertical-align:top;margin:8px 16px 8px 0}.shot img{display:block;max-width:100%;height:auto;border:1px solid #23312b}.shot .cap{margin:4px 0 0}a{color:#33d9ff}.skip{color:#ff8a5c;margin:6px 0}.note{color:#6f8c7d;font-size:12px}</style>');
    out.push('</head><body>');
    out.push('<h1>Screen previews: ' + escHtml(plan.member) + '</h1>');
    var okCount = plan.entries.filter(function (e) { return e.status === 'ok'; }).length;
    out.push('<p class="sub">' + okCount + ' screen' + (okCount === 1 ? '' : 's') + ' from ' + byRecord.length + ' record' + (byRecord.length === 1 ? '' : 's') + ', ' + plan.sizes.length + ' display size' + (plan.sizes.length === 1 ? '' : 's') + ', every indicator off' + (plan.ruler ? ', with the ruler' : '') + '.</p>');
    byRecord.forEach(function (group) {
      out.push('<h2>' + escHtml(group.record) + '<span class="kind">' + escHtml(group.kind) + '</span></h2>');
      group.rows.forEach(function (e) {
        var label = e.size.lines + ' x ' + e.size.columns + (e.size.name ? ' (' + e.size.name + ')' : '');
        if (e.status !== 'ok') {
          out.push('<p class="skip">' + escHtml(label) + ': not exported - ' + escHtml(e.reason) + '</p>');
          return;
        }
        if (!FORMATS.some(function (f) { return has(e.base + '.' + f); })) { out.push('<p class="skip">' + escHtml(label) + ': not exported (no file was written)</p>'); return; }
        var links = FORMATS.filter(function (f) { return has(e.base + '.' + f); }).map(function (f) { return '<a href="' + escHtml(e.base + '.' + f) + '">' + FORMAT_LABELS[f] + '</a>'; }).join(' &middot; ');
        var img = has(e.base + '.svg') ? '<img src="' + escHtml(e.base + '.svg') + '" alt="' + escHtml(e.record + ' ' + label) + '" width="' + Math.round(e.size.columns * 9 + 24) + '">' : '';
        var picture = img && has(e.base + '.html') ? '<a href="' + escHtml(e.base + '.html') + '">' + img + '</a>' : img;
        out.push('<div class="shot">' + picture +
          '<p class="cap">' + escHtml(label) + ' &mdash; ' + links + '</p>' +
          (e.indicators.length ? '<p class="note">Drawn with indicator' + (e.indicators.length > 1 ? 's ' : ' ') + escHtml(e.indicators.join(', ')) + ' on (the record\'s own condition).</p>' : '') +
          (e.empty ? '<p class="note">This record has no fields of its own to draw.</p>' : '') + '</div>');
      });
    });
    out.push('</body></html>');
    return out.join('\n') + '\n';
  }

  /**
   * Write the batch. `api`: { createDirectory(folderName), writeFile(folderName, fileName, text) }, both may return a promise.
   * `hooks`: { isCancelled() -> boolean, onProgress(done, total, label) }. The index is written last, and only when the batch ran to
   * the end. A file that fails to write is recorded and the batch goes on. Resolves
   * { folder, written: [names], failed: [{ name, error }], cancelled, skipped: n, indexWritten }.
   */
  function run(plan, api, hooks) {
    var h = hooks || {};
    var result = { folder: plan.folder, written: [], failed: [], cancelled: false, skipped: plan.entries.filter(function (e) { return e.status !== 'ok'; }).length, indexWritten: false };
    var queue = plan.entries.filter(function (e) { return e.status === 'ok'; });
    var done = 0;
    var cancelled = function () { return typeof h.isCancelled === 'function' && !!h.isCancelled(); };
    var progress = function (label) { if (typeof h.onProgress === 'function') h.onProgress(done, plan.total, label); };

    function writeOne(file) {
      return Promise.resolve().then(function () { return api.writeFile(plan.folder, file.name, file.content); }).then(
        function () { result.written.push(file.name); },
        function (err) { result.failed.push({ name: file.name, error: err && err.message ? err.message : String(err) }); }
      ).then(function () { done++; progress(file.name); });
    }

    function next(i) {
      if (i >= queue.length) return Promise.resolve();
      if (cancelled()) { result.cancelled = true; return Promise.resolve(); }
      var files;
      try { files = queue[i].render(); } catch (err) {
        queue[i].files.forEach(function (n) { result.failed.push({ name: n, error: err && err.message ? err.message : String(err) }); done++; });
        return next(i + 1);
      }
      return files.reduce(function (p, f) { return p.then(function () { return writeOne(f); }); }, Promise.resolve()).then(function () { return next(i + 1); });
    }

    return Promise.resolve(api.createDirectory(plan.folder)).then(function () { return next(0); }).then(function () {
      if (result.cancelled || cancelled()) { result.cancelled = true; return result; }
      return writeOne({ name: INDEX_NAME, content: buildIndex(plan, { written: result.written.concat([INDEX_NAME]) }) }).then(function () {
        result.indexWritten = result.written.indexOf(INDEX_NAME) >= 0;
        return result;
      });
    });
  }

  return {
    FORMATS: FORMATS,
    INDEX_NAME: INDEX_NAME,
    THEME_ACCENTS: THEME_ACCENTS,
    MAX_ENTRIES: MAX_ENTRIES,
    themeFor: themeFor,
    safePart: safePart,
    folderName: folderName,
    prepare: prepare,
    buildIndex: buildIndex,
    run: run
  };
});

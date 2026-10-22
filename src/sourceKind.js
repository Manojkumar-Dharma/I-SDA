/**
 * sourceKind.js (E11b)
 *
 * Tells System/36 SFGR source (a `DSPF36` member or `.dspf36` file) apart from DDS. Pure module, no `vscode`
 * import, so it runs in Node, in the tests and in the extension host.
 *
 * Why it exists. The DDS tooling (diagnostics, hover, completion, outline, quick-fixes, column aids, the screen
 * designer) reads columns 6, 17 - 80 as DDS. SFGR source puts `S`, `D` or `H` in column 6 and lays the rest of the
 * line out differently (docs/sda-reference/SFGR-SPEC.md), so DDS tooling on it reports rules that do not apply and
 * the designer draws nonsense. Every DDS entry point asks `isSfgrSource` first.
 *
 * Decision (E11a, answer 2). The source type decides first: a member of type `DSPF36`, or a file ending `.dspf36`,
 * is SFGR; a known other type (`DSPF`, `DSPF38`, `MNUDDS`, ...) is not, whatever its content looks like. Only when
 * no type can be read does the content decide. One refinement to that rule: a `DSPF36` type whose content is
 * unmistakably DDS (records with `A` in column 6 and none with `S`, `D` or `H`) stays DDS, because this project
 * used `.dspf36` as a naming convention for DDS files before S36-5 (see LIMITATIONS-PLAN.md, S36-1 and S36-5), and
 * those files must keep working.
 *
 *   sourceTypeOf(pathOrUri)            'DSPF36' | 'DSPF' | ... | null   (the extension, upper-cased)
 *   contentKind(text)                  'sfgr' | 'dds' | 'unknown'       (column 6 of every record line)
 *   classify(pathOrUri, text)          { kind: 'sfgr' | 'dds' | 'other' | 'unknown', reason }
 *   isSfgrSource(pathOrUri, text)      boolean; `text` may be a function, read only when the type does not decide
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SourceKind = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SFGR_TYPE = 'DSPF36';
  // Column 6 values of a record line in SFGR source (B-1): display control, field, help.
  var SFGR_SPEC_TYPES = 'SDH';

  /** The source type a path or URI string ends in, upper-cased, or null when there is no extension to read. */
  function sourceTypeOf(pathOrUri) {
    if (typeof pathOrUri !== 'string' || pathOrUri === '') return null;
    var clean = pathOrUri.split('?')[0].split('#')[0];
    var last = clean.split(/[\\/]/).pop() || '';
    var dot = last.lastIndexOf('.');
    if (dot <= 0 || dot === last.length - 1) return null;
    return last.slice(dot + 1).toUpperCase();
  }

  /**
   * What column 6 of the record lines says. Blank lines and lines shorter than 6 characters are skipped; so are
   * comment lines (`*` in column 1) of either format. 'sfgr' needs at least one `S` record and no `A`; 'dds' needs at
   * least one `A` and none of `S`, `D`, `H`; anything else (an empty text, only comments, a mix) is 'unknown'.
   */
  function contentKind(text) {
    if (typeof text !== 'string' || text === '') return 'unknown';
    var lines = text.split(/\r?\n/);
    var sfgrRecords = 0;
    var sfgrControl = 0;
    var ddsRecords = 0;
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (line.length < 6 || line.charAt(0) === '*') continue;
      var c6 = line.charAt(5).toUpperCase();
      if (c6 === 'A') ddsRecords++;
      else if (SFGR_SPEC_TYPES.indexOf(c6) >= 0 && /^[\x20-\x7e]{5}$/.test(line.slice(0, 5)) && line.charAt(5) !== ' ') {
        sfgrRecords++;
        if (c6 === 'S') sfgrControl++;
      }
    }
    if (sfgrControl > 0 && ddsRecords === 0) return 'sfgr';
    if (ddsRecords > 0 && sfgrRecords === 0) return 'dds';
    return 'unknown';
  }

  function textOf(text) {
    if (typeof text === 'function') {
      try { return text(); } catch (e) { return ''; }
    }
    return typeof text === 'string' ? text : '';
  }

  /** `kind` is 'sfgr', 'dds' (a DDS display or menu source), 'other' (a known type that is neither) or 'unknown'. */
  function classify(pathOrUri, text) {
    var type = sourceTypeOf(pathOrUri);
    if (type === SFGR_TYPE) {
      if (contentKind(textOf(text)) === 'dds') return { kind: 'dds', reason: 'DSPF36 name, DDS content' };
      return { kind: 'sfgr', reason: 'source type DSPF36' };
    }
    if (type) return { kind: 'other', reason: 'source type ' + type };
    var byContent = contentKind(textOf(text));
    if (byContent === 'sfgr') return { kind: 'sfgr', reason: 'content: S/D/H records in column 6' };
    if (byContent === 'dds') return { kind: 'dds', reason: 'content: A records in column 6' };
    return { kind: 'unknown', reason: 'no source type, content not recognised' };
  }

  function isSfgrSource(pathOrUri, text) {
    return classify(pathOrUri, text).kind === 'sfgr';
  }

  return { sourceTypeOf: sourceTypeOf, contentKind: contentKind, classify: classify, isSfgrSource: isSfgrSource, SFGR_TYPE: SFGR_TYPE };
});

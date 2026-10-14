/**
 * mnuCmdEngine.js
 *
 * Parses and writes the "MNUCMD" companion source of an IBM i SDA-style menu
 * (MNUDDS). Where a MNUDDS member describes the *visual* layout of a menu
 * (it's plain DDS - see dspfParser.ts/dspfEngine.js, reused as-is for that
 * half), the MNUCMD member is what actually ties numbered options to the
 * commands they run: SDA stores it as a source member named "<menu>QQ" of
 * type MNUCMD, and CRTMNU turns it into the *MSGF that the compiled *MENU
 * object looks up at runtime, one message per option ("0001" -> option 1,
 * "0099" -> option 99, etc).
 *
 * There's no published fixed-column layout for this source the way DDS has
 * one - every real-world example (SDA-generated and hand-written) is simply
 * a 4-digit, zero-padded option number, whitespace, then the command text
 * verbatim, e.g.:
 *
 *   0001 DSPLIBL
 *   0002 CHGCURLIB
 *
 * This parser is intentionally tolerant: any line matching that shape is an
 * option entry; anything else (blank lines, `*`-comments, or lines that
 * don't parse) is preserved verbatim and round-tripped untouched, the same
 * "never lose what we don't understand" discipline dspfWriter.js follows for
 * DDS. Kept dependency-free and UMD-wrapped so the exact same code runs in
 * Node (host + tests) and in the webview (embedded as a <script> tag, no
 * bundler needed) - see buildMenuWebviewTemplate.js.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.MnuCmdEngine = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Matches "0001 DSPLIBL", "12 CALL PGM1", etc: 1-4 digit option number,
  // whitespace, then the rest of the line as the command text verbatim.
  var OPTION_LINE_RE = /^(\d{1,4})\s+(\S.*?)\s*$/;

  function padOptionNumber(n) {
    var s = String(parseInt(n, 10));
    while (s.length < 4) s = '0' + s;
    return s;
  }

  /**
   * @param {string} text - full MNUCMD source text (may be empty/undefined
   *   if no companion member exists yet).
   * @returns {{options: Array<{optionNumber: string, numberValue: number, command: string, sourceLine: number, raw: string}>, lines: string[], errors: Array<{line:number,message:string,raw:string}>}}
   */
  function parseMnuCmd(text) {
    var raw = text == null ? '' : text;
    // An empty (or not-yet-existing) companion member has zero lines, not one
    // blank line - matters for applyOptionCommand's append-at-end position below.
    var lines = raw === '' ? [] : raw.split(/\r\n|\r|\n/);
    // A trailing empty element from a final newline isn't a real line either.
    if (lines.length > 0 && lines[lines.length - 1] === '' && /\r\n|\r|\n$/.test(raw)) {
      lines = lines.slice(0, -1);
    }
    var options = [];
    var errors = [];
    lines.forEach(function (line, idx) {
      if (line.trim() === '' || /^\s*\*/.test(line)) return; // blank / comment - not an option
      var m = OPTION_LINE_RE.exec(line);
      if (m) {
        options.push({
          optionNumber: padOptionNumber(m[1]),
          numberValue: parseInt(m[1], 10),
          command: m[2],
          sourceLine: idx + 1,
          raw: line,
        });
      } else {
        errors.push({ line: idx + 1, message: 'Line does not match "<option number> <command>" - left untouched', raw: line });
      }
    });
    options.sort(function (a, b) { return a.numberValue - b.numberValue; });
    return { options: options, lines: lines, errors: errors };
  }

  /**
   * Returns new full MNUCMD source text with the given option's command set.
   * Updates the option's existing line in place (preserving every other
   * line byte-for-byte, same splice-not-rebuild discipline as dspfWriter.js)
   * if it already exists; otherwise appends a new line in numeric order.
   * Passing an empty/whitespace-only command removes the option's line
   * entirely (menu option no longer runs anything).
   *
   * @param {string} text - current MNUCMD source (may be empty/undefined).
   * @param {number|string} optionNumber
   * @param {string} newCommand
   * @returns {string}
   */
  function applyOptionCommand(text, optionNumber, newCommand) {
    var parsed = parseMnuCmd(text);
    var padded = padOptionNumber(optionNumber);
    var numberValue = parseInt(optionNumber, 10);
    var lines = parsed.lines.slice();
    var command = (newCommand == null ? '' : newCommand).trim();

    var existingLineIdx = null;
    parsed.options.forEach(function (opt) {
      if (opt.optionNumber === padded) existingLineIdx = opt.sourceLine - 1;
    });

    if (existingLineIdx !== null) {
      if (command === '') {
        lines.splice(existingLineIdx, 1);
      } else {
        lines[existingLineIdx] = padded + ' ' + command;
      }
    } else if (command !== '') {
      // Insert in numeric order, right before the first existing option with
      // a higher number (or at the end if none), so the file stays readable.
      var insertAt = lines.length;
      for (var i = 0; i < parsed.options.length; i++) {
        if (parsed.options[i].numberValue > numberValue) {
          insertAt = parsed.options[i].sourceLine - 1;
          break;
        }
      }
      lines.splice(insertAt, 0, padded + ' ' + command);
    }
    // command === '' and no existing line: nothing to remove, no-op.

    return lines.join('\n') + (lines.length > 0 ? '\n' : '');
  }

  /** The message ID Compile Menu writes for an option: USR plus the option number padded to four digits. */
  function messageIdForOption(optionNumber) {
    return 'USR' + padOptionNumber(optionNumber);
  }

  /**
   * E4e - how one option's command compares with the message USRnnnn in the menu's message file. Compile Menu stores
   * the option's mapped command (the MNUCMD line) as that message's text, so "drift" is a message that no longer says
   * what the command says (someone changed one of them since the last compile).
   *
   * @param {string} command - the option's command from the MNUCMD member ('' when none is mapped).
   * @param {{ok: boolean, text?: string, code?: string}|undefined} entry - the host's answer for the message ID.
   * @returns {{state: 'loading'|'match'|'differs'|'missing'|'orphan'|'none'|'unavailable', text: string, reason: string}}
   *   missing = a command but no message yet (Compile Menu creates it); orphan = a message but no command;
   *   none = neither, nothing to say; unavailable = the host could not read it (reason says why).
   */
  /** E4f: the same note the Screen Designer shows when message text cannot be read because IBM i is not connected. */
  var NOT_CONNECTED_NOTE = 'Message text unavailable (not connected) - connect to IBM i to see it.';

  function optionMessageState(command, entry) {
    var cmd = String(command == null ? '' : command).trim();
    if (!entry) return { state: 'loading', text: '', reason: '' };
    if (entry.ok) {
      var text = String(entry.text == null ? '' : entry.text).trim();
      if (cmd === '') return { state: 'orphan', text: text, reason: '' };
      return { state: text === cmd ? 'match' : 'differs', text: text, reason: '' };
    }
    if (entry.code === 'not-found') return { state: cmd === '' ? 'none' : 'missing', text: '', reason: '' };
    var reasons = { 'not-connected': 'not connected', unsupported: 'not supported on this release', 'bad-msgf': 'not a valid message file', 'bad-id': 'not a valid message ID' };
    return { state: 'unavailable', text: '', reason: reasons[entry.code] || 'lookup failed' };
  }

  return {
    messageIdForOption: messageIdForOption,
    optionMessageState: optionMessageState,
    NOT_CONNECTED_NOTE: NOT_CONNECTED_NOTE,
    parseMnuCmd: parseMnuCmd,
    applyOptionCommand: applyOptionCommand,
    padOptionNumber: padOptionNumber,
  };
});

/**
 * tempLibraryCrtlibText.test.js
 *
 * Fix (v0.16.3): CRTLIB for the ISDATEMP library failed on a real IBM i V7R3M0 system with
 * "Value 'iSDA tempo' for TEXT exceeds 50 characters. Error found on CRTLIB command." Two places
 * create the library - extension.ts (ensureIsdaTempLibrary, shared by the QDBRTVFD wrapper and
 * the message-file resolver) and jobDateFormat.js (its standalone path) - and their TEXT values
 * were 77 and 58 characters. IBM i object text is at most 50.
 *
 * Verifies:
 *  1. every literal TEXT('...') the extension builds into a command (extension.ts and the plain
 *     modules) is at most 50 characters, so no command can hit that limit again.
 *  2. both CRTLIB commands exist and carry a text of at most 50 characters.
 *  3. the standalone path in jobDateFormat.js sends that command when the library is missing.
 *
 * Run with: node src/test/tempLibraryCrtlibText.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { check, failureCount } = require('./helpers/harness');
const JobDateFormat = require(path.join(__dirname, '../jobDateFormat.js'));

const srcDir = path.join(__dirname, '..');
const files = ['extension.ts', 'jobDateFormat.js', 'messageFile.js', 'qdbrtvfdParser.js', 'dspfWriter.js', 'mnuCmdEngine.js'];

// ---- 1. every literal TEXT('...') in a command string is within 50 characters ---------------
const LITERAL = /TEXT\(\s*'([^'$]*)'\s*\)/g;
let seen = 0;
const tooLong = [];
files.forEach((f) => {
  const full = path.join(srcDir, f);
  if (!fs.existsSync(full)) return;
  const text = fs.readFileSync(full, 'utf8');
  let m;
  LITERAL.lastIndex = 0;
  while ((m = LITERAL.exec(text)) !== null) {
    seen++;
    if (m[1].length > 50) tooLong.push(f + ': ' + m[1].length + ' chars: ' + m[1]);
  }
});
check('the scan found the TEXT literals it is meant to guard (CRTLIB x2, CRTSRCPF, ADDPFM)', seen >= 4);
check('no literal TEXT value is over 50 characters' + (tooLong.length ? ' - ' + tooLong.join(' | ') : ''), tooLong.length === 0);

// ---- 2. both CRTLIB commands carry a short text --------------------------------------------
const ext = fs.readFileSync(path.join(srcDir, 'extension.ts'), 'utf8');
const jdf = fs.readFileSync(path.join(srcDir, 'jobDateFormat.js'), 'utf8');
const extText = /CRTLIB LIB\(\$\{ISDA_TEMP_LIBRARY\}\) TEXT\('([^']*)'\)/.exec(ext);
const jdfText = /CRTLIB LIB\(" \+ LIBRARY \+ "\) TEXT\('([^']*)'\)/.exec(jdf);
check('extension.ts creates ISDATEMP with a CRTLIB that has a TEXT', !!extText);
check('jobDateFormat.js creates ISDATEMP with a CRTLIB that has a TEXT', !!jdfText);
check('both texts are 50 characters or fewer', !!extText && !!jdfText && extText[1].length <= 50 && jdfText[1].length <= 50);
check('both texts still say what the library is for', !!extText && !!jdfText && /iSDA/.test(extText[1]) && /iSDA/.test(jdfText[1]) && /safe to delete/.test(extText[1]) && /safe to delete/.test(jdfText[1]));

// ---- 3. the standalone path sends it when the library is missing ------------------------------
(async () => {
  const commands = [];
  const connection = {
    runSQL: async (sql) => (/SYSSCHEMAS/.test(sql) ? [] : []),
    runCommand: async (c) => { commands.push(c.command); return { code: 0, stdout: '', stderr: '' }; }
  };
  if (typeof JobDateFormat.resetForTests === 'function') JobDateFormat.resetForTests();
  try { await JobDateFormat.fetchJobDateFormat(connection); } catch (e) { /* only the commands sent matter here */ }
  const crtlib = commands.filter((c) => /^CRTLIB /.test(c));
  check('the standalone path sent one CRTLIB for ISDATEMP', crtlib.length === 1 && /LIB\(ISDATEMP\)/.test(crtlib[0]));
  const t = crtlib[0] && /TEXT\('([^']*)'\)/.exec(crtlib[0]);
  check('the CRTLIB it sent has a text of 50 characters or fewer', !!t && t[1].length <= 50);
  process.exit(failureCount() === 0 ? 0 : 1);
})();

/**
 * i149RetKeyRetCmdKeyRules.test.js
 *
 * Task I-149 - the I-121b slice found RETKEY / RETCMDKEY accepted with every
 * exclusion their section states and in files without INDARA. Spec facts:
 * fileAndRecordExcludes, recordExcludes, fileExcludes, fileRequires. Same
 * diff-based shape as I-140 / I-151: only a clash the edit adds is reported,
 * from either side (adding RETKEY, or adding HELP at the file level while a
 * record has RETKEY).
 *
 * Run with: node src/test/i149RetKeyRetCmdKeyRules.test.js
 */
const path = require('path');
const DspfParser = require(path.join(__dirname, '../../dist/dspfParser.js'));
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const { buildLine } = require('../fixtures/lineBuilder');
const { check, failureCount } = require('./helpers/harness');

let n = 0;
const L = (o) => buildLine(Object.assign({ seq: String(++n * 10 + 1000).slice(-5) }, o));
function model(lines) { n = 0; return DspfParser.parseDspf(lines.map(L).join('\n') + '\n'); }
const R = (name, extra) => [{ nameType: 'R', name }].concat(extra || []);
const file = (kws) => (kws || []).map((f) => ({ func: f }));
const reason = (a, b) => DspfWriter.retKeyNewConflictReason(model(a), model(b));
const withIndara = (kws) => file(['INDARA'].concat(kws || []));

// ---- spec facts the guard reads ----
check('RETKEY facts: file+record, record, file exclusions and INDARA', KeywordSpec.fileAndRecordExcludes('RETKEY').join() === 'CLEAR,HELP,HOME,PAGEUP,PAGEDOWN,ROLLDOWN,ROLLUP' && KeywordSpec.recordExcludes('RETKEY').join() === 'PRINT' && KeywordSpec.fileExcludes('RETKEY').join() === 'ALTHELP,ALTPAGEUP,ALTPAGEDWN' && KeywordSpec.fileRequires('RETKEY').join() === 'INDARA');
check('RETCMDKEY facts: CAnn/CFnn at file+record, SFLDROP/SFLENTER/SFLFOLD on the record', KeywordSpec.fileAndRecordExcludes('RETCMDKEY').join() === 'CAnn,CFnn' && KeywordSpec.recordExcludes('RETCMDKEY').join() === 'SFLDROP,SFLENTER,SFLFOLD');

// ---- INDARA ----
const base = (fileKws, recKws) => withIndara(fileKws).concat(R('REC', file(recKws)));
check('RETKEY with INDARA and nothing else is accepted', reason(base([], []), base([], ['RETKEY'])) === null);
check('RETCMDKEY with INDARA and nothing else is accepted', reason(base([], []), base([], ['RETCMDKEY'])) === null);
check('RETKEY in a file without INDARA is refused', /requires the file to specify INDARA/.test(reason(R('REC'), R('REC', file(['RETKEY']))) || ''));
check('RETCMDKEY in a file without INDARA is refused', /requires the file to specify INDARA/.test(reason(R('REC'), R('REC', file(['RETCMDKEY']))) || ''));
check('removing INDARA while RETKEY stays is refused', /INDARA/.test(reason(base([], ['RETKEY']), R('REC', file(['RETKEY']))) || ''));

// ---- RETKEY: file + record exclusions ----
['CLEAR', 'HELP', 'HOME', 'PAGEUP', 'PAGEDOWN', 'ROLLDOWN', 'ROLLUP'].forEach((k) => {
  check('RETKEY then ' + k + ' on the same record is refused', /same record format/.test(reason(base([], ['RETKEY']), base([], ['RETKEY', k])) || ''));
  check('RETKEY on a record in a file with ' + k + ' at the file level is refused', /file level/.test(reason(base([k], []), base([k], ['RETKEY'])) || ''));
  check('adding ' + k + ' at the file level while a record has RETKEY is refused', /file level/.test(reason(base([], ['RETKEY']), base([k], ['RETKEY'])) || ''));
});
check('RETKEY with PRINT on the same record is refused', /PRINT/.test(reason(base([], ['RETKEY']), base([], ['RETKEY', 'PRINT'])) || ''));
check('PRINT at the file level is allowed with RETKEY (record-only exclusion)', reason(base([], ['RETKEY']), base(['PRINT'], ['RETKEY'])) === null);
check('HLPRTN at the file level is allowed with RETKEY', reason(base([], ['RETKEY']), base(['HLPRTN'], ['RETKEY'])) === null);

// ---- RETCMDKEY: command keys and subfile keys ----
check('RETCMDKEY then CA03 on the same record is refused', /CAnn/.test(reason(base([], ['RETCMDKEY']), base([], ['RETCMDKEY', 'CA03'])) || ''));
check('RETCMDKEY then CF12 on the same record is refused', /CFnn/.test(reason(base([], ['RETCMDKEY']), base([], ['RETCMDKEY', 'CF12'])) || ''));
check('CA03 at the file level then RETCMDKEY on a record is refused', /file level/.test(reason(base(['CA03'], []), base(['CA03'], ['RETCMDKEY'])) || ''));
check('adding CF05 at the file level while a record has RETCMDKEY is refused', /file level/.test(reason(base([], ['RETCMDKEY']), base(['CF05'], ['RETCMDKEY'])) || ''));
['SFLDROP(CA10)', 'SFLENTER(CA11)', 'SFLFOLD(CF09)'].forEach((k) => {
  const name = k.split('(')[0];
  check('RETCMDKEY then ' + name + ' on the same record is refused', new RegExp(name).test(reason(base([], ['RETCMDKEY']), base([], ['RETCMDKEY', k])) || ''));
});
check('RETKEY with CA03 is allowed (the CAnn exclusion is RETCMDKEY\'s)', reason(base([], ['RETKEY']), base([], ['RETKEY', 'CA03'])) === null);
check('RETCMDKEY with HELP is allowed (the HELP exclusion is RETKEY\'s)', reason(base([], ['RETCMDKEY']), base([], ['RETCMDKEY', 'HELP'])) === null);

// ---- alt keys at the file level ----
['ALTHELP', 'ALTPAGEUP', 'ALTPAGEDWN'].forEach((k) => {
  ['RETKEY', 'RETCMDKEY'].forEach((kw) => {
    check(kw + ' in a file with ' + k + ' is refused', new RegExp(k).test(reason(base([], [kw]), base([k], [kw])) || ''));
  });
});

// ---- hand-written leftovers are not re-reported ----
const bad = (extra) => base(['HELP'], ['RETKEY']).concat(extra || []);
check('an existing clash is not re-reported on an unrelated edit', reason(bad(), bad(file(['SFLEND']))) === null);
check('an existing missing-INDARA is not re-reported on an unrelated edit', reason(R('REC', file(['RETKEY'])), R('REC', file(['RETKEY', 'PUTOVR']))) === null);
check('a second clash added to a record that already has one IS reported', /PRINT/.test(reason(base([], ['RETKEY', 'HELP']), base([], ['RETKEY', 'HELP', 'PRINT'])) || ''));

// ---- both keywords at once, each message names its own keyword ----
check('RETCMDKEY and RETKEY together report the one the edit added', /RETKEY/.test(reason(base([], ['RETCMDKEY']), base([], ['RETCMDKEY', 'RETKEY', 'HOME'])) || ''));

// ---- wiring ----
check('the guard is exported and used by the webview edit choke point', typeof DspfWriter.retKeyNewConflictReason === 'function' && /retKeyNewConflictReason/.test(require('fs').readFileSync(path.join(__dirname, '../buildWebviewTemplate.js'), 'utf8')));

console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : 'FAIL - ' + failureCount() + ' check(s) failed'));
process.exit(failureCount() === 0 ? 0 : 1);

/**
 * i164CommandFunctionPairings.test.js
 *
 * Task I-164 - the I-121h slice found three pairings accepted: PAGEDOWN with
 * ROLLUP and PAGEUP with ROLLDOWN (same keyword under two names), and INVITE at
 * both the file and the record level. Spec facts: notWithAlternateName on
 * PAGEDOWN / PAGEUP, notAtBothFileAndRecordLevel on INVITE. Model-diff guard
 * (the I-140 / I-149 shape): only a clash an edit adds is reported, from either
 * side.
 *
 * Run with: node src/test/i164CommandFunctionPairings.test.js
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
const f = (func) => ({ func });
const rec = (name, kws) => [{ nameType: 'R', name }].concat((kws || []).map(f));
const reason = (a, b) => DspfWriter.commandFunctionPairingNewConflictReason(model(a), model(b));

// ---- facts ----
check('facts: PAGEDOWN not with ROLLUP, PAGEUP not with ROLLDOWN, INVITE not at both levels',
  KeywordSpec.commandFunctionNotWithAlternateName('PAGEDOWN') === 'ROLLUP' && KeywordSpec.commandFunctionNotWithAlternateName('PAGEUP') === 'ROLLDOWN' &&
  KeywordSpec.commandFunctionNotWithAlternateName('INVITE') === null && KeywordSpec.commandFunctionNotWithAlternateName(null) === null &&
  KeywordSpec.commandFunctionNotAtBothLevels('INVITE') === true);

// ---- PAGEDOWN / ROLLUP, PAGEUP / ROLLDOWN on a record ----
check('PAGEDOWN alone is accepted', reason(rec('R1'), rec('R1', ['PAGEDOWN'])) === null);
check('ROLLUP alone is accepted', reason(rec('R1'), rec('R1', ['ROLLUP'])) === null);
check('PAGEDOWN added to a record that has ROLLUP is refused', /ROLLUP cannot be specified with PAGEDOWN/.test(reason(rec('R1', ['ROLLUP']), rec('R1', ['ROLLUP', 'PAGEDOWN'])) || ''));
check('ROLLUP added to a record that has PAGEDOWN is refused', /ROLLUP cannot be specified with PAGEDOWN/.test(reason(rec('R1', ['PAGEDOWN']), rec('R1', ['PAGEDOWN', 'ROLLUP'])) || ''));
check('PAGEUP added to a record that has ROLLDOWN is refused', /ROLLDOWN cannot be specified with PAGEUP/.test(reason(rec('R1', ['ROLLDOWN']), rec('R1', ['ROLLDOWN', 'PAGEUP'])) || ''));
check('ROLLDOWN added to a record that has PAGEUP is refused', /ROLLDOWN cannot be specified with PAGEUP/.test(reason(rec('R1', ['PAGEUP']), rec('R1', ['PAGEUP', 'ROLLDOWN'])) || ''));
check('PAGEDOWN with ROLLDOWN is accepted (different pairs)', reason(rec('R1', ['PAGEDOWN']), rec('R1', ['PAGEDOWN', 'ROLLDOWN'])) === null);
check('PAGEUP with ROLLUP is accepted (different pairs)', reason(rec('R1', ['PAGEUP']), rec('R1', ['PAGEUP', 'ROLLUP'])) === null);
check('PAGEDOWN and PAGEUP together are accepted', reason(rec('R1', ['PAGEDOWN']), rec('R1', ['PAGEDOWN', 'PAGEUP'])) === null);
check('both pairs clashing at once report the one the edit adds', /ROLLDOWN/.test(reason(rec('R1', ['PAGEDOWN', 'ROLLUP']).concat([]), rec('R1', ['PAGEDOWN', 'ROLLUP', 'PAGEUP', 'ROLLDOWN'])) || ''));
check('the clash is per record: PAGEDOWN on R1, ROLLUP on R2 is accepted', reason(rec('R1', ['PAGEDOWN']).concat(rec('R2')), rec('R1', ['PAGEDOWN']).concat(rec('R2', ['ROLLUP']))) === null);

// ---- at the file level ----
check('ROLLUP added to a file that has PAGEDOWN (both file level) is refused', /file level/.test(reason([f('PAGEDOWN')].concat(rec('R1')), [f('PAGEDOWN'), f('ROLLUP')].concat(rec('R1'))) || ''));
check('a file-level ROLLUP with a record-level PAGEDOWN is accepted (the section does not say it is refused)', reason([f('ROLLUP')].concat(rec('R1')), [f('ROLLUP')].concat(rec('R1', ['PAGEDOWN']))) === null);
check('a file-level PAGEUP with a record-level ROLLDOWN is accepted', reason([f('PAGEUP')].concat(rec('R1')), [f('PAGEUP')].concat(rec('R1', ['ROLLDOWN']))) === null);

// ---- INVITE ----
check('INVITE at record level only is accepted', reason(rec('R1'), rec('R1', ['INVITE'])) === null);
check('INVITE at file level only is accepted', reason(rec('R1'), [f('INVITE')].concat(rec('R1'))) === null);
check('INVITE added at record level to a file that has INVITE is refused', /both the file level and the record level/.test(reason([f('INVITE')].concat(rec('R1')), [f('INVITE')].concat(rec('R1', ['INVITE']))) || ''));
check('INVITE added at file level with a record-level INVITE is refused', /both the file level and the record level/.test(reason(rec('R1', ['INVITE']), [f('INVITE')].concat(rec('R1', ['INVITE']))) || ''));
check('INVITE on two records with no file-level INVITE is accepted', reason(rec('R1', ['INVITE']).concat(rec('R2')), rec('R1', ['INVITE']).concat(rec('R2', ['INVITE']))) === null);
check('the refusal names the record format', /record format R2/.test(reason([f('INVITE')].concat(rec('R1')).concat(rec('R2')), [f('INVITE')].concat(rec('R1')).concat(rec('R2', ['INVITE']))) || ''));

// ---- hand-written leftovers ----
const bad = rec('R1', ['PAGEDOWN', 'ROLLUP']);
check('an existing PAGEDOWN + ROLLUP is not re-reported on an unrelated edit', reason(bad, bad.concat([f('HELP')])) === null);
check('removing one of the pair is never blocked', reason(bad, rec('R1', ['PAGEDOWN'])) === null);
check('an existing INVITE at both levels is not re-reported on an unrelated edit', reason([f('INVITE')].concat(rec('R1', ['INVITE'])), [f('INVITE')].concat(rec('R1', ['INVITE', 'HELP']))) === null);
check('a second clash added next to an existing one IS reported', /INVITE/.test(reason([f('INVITE')].concat(rec('R1', ['PAGEDOWN', 'ROLLUP'])).concat(rec('R2')), [f('INVITE')].concat(rec('R1', ['PAGEDOWN', 'ROLLUP'])).concat(rec('R2', ['INVITE']))) || ''));

// ---- wiring ----
check('the guard is exported and used by the webview edit choke point', typeof DspfWriter.commandFunctionPairingNewConflictReason === 'function' && /commandFunctionPairingNewConflictReason/.test(require('fs').readFileSync(path.join(__dirname, '../buildWebviewTemplate.js'), 'utf8')));

console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : 'FAIL - ' + failureCount() + ' check(s) failed'));
process.exit(failureCount() === 0 ? 0 : 1);

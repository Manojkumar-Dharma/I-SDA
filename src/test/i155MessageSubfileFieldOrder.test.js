/**
 * i155MessageSubfileFieldOrder.test.js
 *
 * Task I-155 - the SFLMSGRCD section: "There can be only two predefined fields
 * specified on the subfile record format for a message subfile": the message
 * identifier (SFLMSGKEY) is always FIRST, the program queue name (SFLPGMQ) is
 * SECOND and immediately follows. The count and order were not checked. Facts
 * come from RECORD_TYPES.SFLMSGRCD.predefinedFields (I-121d); the guard is the
 * I-145 subfileKeywordNewConflictReason (diff-based).
 *
 * Not refused: fewer than two fields (a message subfile is built field by
 * field), and SFLMSGRCD's field-name parameter (kept - see keywordFixes.md I-155).
 *
 * Run with: node src/test/i155MessageSubfileFieldOrder.test.js
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
const dsp = { func: 'DSPSIZ(24 80 *DS3)' };
const rec = (extra) => [dsp, { nameType: 'R', name: 'MSGSFL', func: 'SFL' }, { func: 'SFLMSGRCD(23)' }].concat(extra || []);
const key = (name) => ({ name: name || 'MSGKEY', usage: 'H', func: 'SFLMSGKEY' });
const pgmq = (name) => ({ name: name || 'PGMQ', usage: 'H', func: 'SFLPGMQ' });
const plain = (name) => ({ name, length: '10', dataType: 'A', usage: 'O' });
const reason = (a, b) => DspfWriter.subfileKeywordNewConflictReason(model(a), model(b));

const pf = KeywordSpec.messageSubfileFacts().predefinedFields;
check('spec facts: SFLMSGKEY first, SFLPGMQ second', pf[0].requires === 'SFLMSGKEY' && pf[0].position === 1 && pf[1].requires === 'SFLPGMQ' && pf[1].position === 2);

// ---- accepted ----
check('SFLMSGKEY then SFLPGMQ is accepted', reason(rec([key()]), rec([key(), pgmq()])) === null);
check('SFLMSGKEY alone (built field by field) is accepted', reason(rec(), rec([key()])) === null);
check('a message subfile with no fields yet is accepted', reason([dsp, { nameType: 'R', name: 'MSGSFL', func: 'SFL' }], rec()) === null);
check('an ordinary subfile record is not judged', reason([dsp, { nameType: 'R', name: 'SFLR', func: 'SFL' }, plain('A'), plain('B'), plain('C')], [dsp, { nameType: 'R', name: 'SFLR', func: 'SFL' }, plain('A'), plain('B'), plain('C'), plain('D')]) === null);

// ---- count ----
check('a third field on a message subfile is refused', /only 2 predefined fields/.test(reason(rec([key(), pgmq()]), rec([key(), pgmq(), plain('EXTRA')])) || ''));
check('a field added to a record that already has SFLMSGKEY + SFLPGMQ + two others is not re-reported', reason(rec([key(), pgmq(), plain('X')]), rec([key(), pgmq(), plain('X'), plain('Y')])) === null);

// ---- order ----
check('SFLPGMQ first, SFLMSGKEY second is refused', /must be on the first field|must be the message identifier/.test(reason(rec([key(), pgmq()]), rec([pgmq(), key()])) || ''));
check('SFLPGMQ alone on the FIRST field is refused', /first field of a message subfile|SFLPGMQ must be on the second field/.test(reason(rec(), rec([pgmq()])) || ''));
check('an unrelated field first, SFLMSGKEY second is refused', /first field of a message subfile/.test(reason(rec(), rec([plain('OTHER'), key()])) || ''));
check('SFLMSGKEY first then an unrelated second field is refused', /second field of a message subfile \(OTHER/.test(reason(rec([key()]), rec([key(), plain('OTHER')])) || ''));
check('SFLMSGKEY on the second field is refused (naming SFLMSGKEY)', /SFLMSGKEY must be on the first field/.test(reason(rec([plain('OTHER')]), rec([plain('OTHER'), key()])) || ''));

// ---- leftovers ----
check('an already-misordered hand-written subfile is not re-reported on an unrelated edit', reason(rec([pgmq(), key()]), rec([pgmq(), key()]).concat([{ func: 'SFLEND' }])) === null);
check('renaming a field of an already-wrong message subfile is not blocked', reason(rec([pgmq('A'), key('B')]), rec([pgmq('A2'), key('B')])) === null);

// The Add-message-subfile dialog's own SFLMSGKEY + SFLPGMQ pair (first, second) is
// covered by dspfWebview.test.js ("Message subfile (SFLMSG)"), which runs through
// this guard unchanged.

// ---- wiring ----
check('the guard stays wired to the webview edit choke point', /subfileKeywordNewConflictReason/.test(require('fs').readFileSync(path.join(__dirname, '../buildWebviewTemplate.js'), 'utf8')));

console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : 'FAIL - ' + failureCount() + ' check(s) failed'));
process.exit(failureCount() === 0 ? 0 : 1);

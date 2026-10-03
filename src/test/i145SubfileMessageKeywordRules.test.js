/**
 * i145SubfileMessageKeywordRules.test.js
 *
 * Task I-145 - the I-121d slice found rules from the DDS Reference that no
 * guard enforced: SFLRNA without SFLINZ / on a message subfile; SFLINZ on a
 * message subfile without SFLPGMQ; SFLMODE's field (A, length 1, usage H, in
 * the control record, written &name); SFLMSGRCD's line number and its
 * predefined fields (SFLMSGKEY A4, SFLPGMQ A10 or 276; written with only a
 * name and the keyword, so a blank type / length is fine and only a conflicting
 * value is refused). Same diff-based shape as
 * I-140 / I-141: only a violation the edit adds is reported.
 *
 * Not done here (see keywordFixes.md I-145): the "field selection" cases -
 * the reference does not define it in a way the parsed model can see.
 *
 * Run with: node src/test/i145SubfileMessageKeywordRules.test.js
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
const dsp = (t) => ({ func: 'DSPSIZ(' + (t || '24 80 *DS3') + ')' });
const sflRec = (name, extra) => [{ nameType: 'R', name, func: 'SFL' }].concat(extra || []);
const ctlRec = (name, sfl, extra) => [{ nameType: 'R', name, func: 'SFLCTL(' + sfl + ')' }, { func: 'SFLSIZ(0020)' }, { func: 'SFLPAG(0005)' }].concat(extra || []);
const fld = (name, len, dt, usage, func) => ({ name, length: String(len), dataType: dt, usage, func });
const reason = (a, b) => DspfWriter.subfileKeywordNewConflictReason(model(a), model(b));

// ---- SFLRNA ----
const plainSfl = sflRec('SFLREC', [fld('ROWNAME', 20, 'A', 'O')]);
check('SFLRNA without SFLINZ is refused', /SFLINZ/.test(reason([dsp()].concat(plainSfl, ctlRec('CTL', 'SFLREC')), [dsp()].concat(plainSfl, ctlRec('CTL', 'SFLREC', [{ func: 'SFLRNA' }]))) || ''));
check('SFLRNA with SFLINZ is accepted', reason([dsp()].concat(plainSfl, ctlRec('CTL', 'SFLREC')), [dsp()].concat(plainSfl, ctlRec('CTL', 'SFLREC', [{ func: 'SFLINZ' }, { func: 'SFLRNA' }]))) === null);
check('removing SFLINZ while SFLRNA stays is refused', /SFLINZ/.test(reason([dsp()].concat(plainSfl, ctlRec('CTL', 'SFLREC', [{ func: 'SFLINZ' }, { func: 'SFLRNA' }])), [dsp()].concat(plainSfl, ctlRec('CTL', 'SFLREC', [{ func: 'SFLRNA' }]))) || ''));
check('an already-invalid SFLRNA is not re-reported on an unrelated edit', reason([dsp()].concat(plainSfl, ctlRec('CTL', 'SFLREC', [{ func: 'SFLRNA' }])), [dsp('24 80 *DS3')].concat(plainSfl, ctlRec('CTL', 'SFLREC', [{ func: 'SFLRNA' }, { func: 'SFLEND' }]))) === null);

// ---- message subfile ----
const msgSfl = (withQ) => sflRec('MSGSFL', [{ func: 'SFLMSGRCD(23)' }, fld('MSGKEY', 4, 'A', 'H', 'SFLMSGKEY')].concat(withQ ? [fld('PGMQ', 10, 'A', 'H', 'SFLPGMQ')] : []));
check('SFLRNA on a message subfile is refused', /message subfile/.test(reason([dsp()].concat(msgSfl(true), ctlRec('MCTL', 'MSGSFL', [{ func: 'SFLINZ' }])), [dsp()].concat(msgSfl(true), ctlRec('MCTL', 'MSGSFL', [{ func: 'SFLINZ' }, { func: 'SFLRNA' }]))) || ''));
check('SFLINZ on a message subfile without SFLPGMQ is refused', /SFLPGMQ/.test(reason([dsp()].concat(msgSfl(false), ctlRec('MCTL', 'MSGSFL')), [dsp()].concat(msgSfl(false), ctlRec('MCTL', 'MSGSFL', [{ func: 'SFLINZ' }]))) || ''));
check('SFLINZ on a message subfile with SFLPGMQ is accepted', reason([dsp()].concat(msgSfl(true), ctlRec('MCTL', 'MSGSFL')), [dsp()].concat(msgSfl(true), ctlRec('MCTL', 'MSGSFL', [{ func: 'SFLINZ' }]))) === null);
check('removing the SFLPGMQ field while SFLINZ stays is refused', /SFLPGMQ/.test(reason([dsp()].concat(msgSfl(true), ctlRec('MCTL', 'MSGSFL', [{ func: 'SFLINZ' }])), [dsp()].concat(msgSfl(false), ctlRec('MCTL', 'MSGSFL', [{ func: 'SFLINZ' }]))) || ''));
check('SFLINZ on an ordinary subfile needs nothing more', reason([dsp()].concat(plainSfl, ctlRec('CTL', 'SFLREC')), [dsp()].concat(plainSfl, ctlRec('CTL', 'SFLREC', [{ func: 'SFLINZ' }]))) === null);

// ---- SFLMODE ----
const modeBase = (mode, f) => [dsp()].concat(plainSfl, [{ nameType: 'R', name: 'CTL', func: 'SFLCTL(SFLREC)' }, { func: 'SFLSIZ(0020)' }, { func: 'SFLPAG(0005)' }].concat(mode ? [{ func: mode }] : [], f ? [f] : []));
check('SFLMODE(&MODE) with a hidden A1 field is accepted', reason(modeBase(null, fld('MODE', 1, 'A', 'H')), modeBase('SFLMODE(&MODE)', fld('MODE', 1, 'A', 'H'))) === null);
check('SFLMODE without the leading & is refused', /leading &/.test(reason(modeBase(null, fld('MODE', 1, 'A', 'H')), modeBase('SFLMODE(MODE)', fld('MODE', 1, 'A', 'H'))) || ''));
check('SFLMODE naming a missing field is refused', /does not exist/.test(reason(modeBase(null, null), modeBase('SFLMODE(&MODE)', null)) || ''));
check('SFLMODE field of the wrong length is refused', /length is 2/.test(reason(modeBase(null, fld('MODE', 2, 'A', 'H')), modeBase('SFLMODE(&MODE)', fld('MODE', 2, 'A', 'H'))) || ''));
check('SFLMODE field that is not hidden is refused', /usage/.test(reason(modeBase(null, fld('MODE', 1, 'A', 'B')), modeBase('SFLMODE(&MODE)', fld('MODE', 1, 'A', 'B'))) || ''));
check('SFLMODE field of the wrong type is refused', /data type/.test(reason(modeBase(null, fld('MODE', 1, 'S', 'H')), modeBase('SFLMODE(&MODE)', fld('MODE', 1, 'S', 'H'))) || ''));
check('an existing bad SFLMODE is not re-reported on an unrelated edit', reason(modeBase('SFLMODE(MODE)', fld('MODE', 1, 'A', 'H')), modeBase('SFLMODE(MODE)', fld('MODE', 1, 'A', 'H')).concat([{ func: 'SFLEND' }])) === null);

// ---- SFLMSGRCD ----
const msgLine = (p, dspParam) => [dsp(dspParam)].concat(sflRec('MSGSFL', [{ func: 'SFLMSGRCD(' + p + ')' }, fld('MSGKEY', 4, 'A', 'H', 'SFLMSGKEY')]));
check('SFLMSGRCD(23) on a 24-line display is accepted', reason(msgLine('22'), msgLine('23')) === null);
check('SFLMSGRCD(25) on a 24-line display is refused', /1 to 24/.test(reason(msgLine('22'), msgLine('25')) || ''));
check('SFLMSGRCD(0) is refused', /1 to 24/.test(reason(msgLine('22'), msgLine('0')) || ''));
check('SFLMSGRCD(1,5) is refused', /SFLMSGRCD\(1,5\)/.test(reason(msgLine('22'), msgLine('1,5')) || ''));
check('SFLMSGRCD(LINEFLD) - the panel\'s field-name form - is left alone', reason(msgLine('22'), msgLine('LINEFLD')) === null);
check('SFLMSGRCD(26) is accepted when DSPSIZ includes a 27-line size', reason(msgLine('22', '24 80 *DS3 27 132 *DS4'), msgLine('26', '24 80 *DS3 27 132 *DS4')) === null);
const msgFields = (kw, len, usage) => [dsp()].concat(sflRec('MSGSFL', [{ func: 'SFLMSGRCD(23)' }, fld('F1', len, 'A', usage, kw)]));
check('SFLMSGKEY on an A4 hidden field is accepted', reason(msgFields('SFLMSGKEY', 4, 'H'), msgFields('SFLMSGKEY', 4, 'H')) === null);
check('SFLMSGKEY on an A5 field is refused', /SFLMSGKEY field F1/.test(reason(msgFields('SFLMSGKEY', 4, 'H'), msgFields('SFLMSGKEY', 5, 'H')) || ''));
check('SFLPGMQ on an A10 hidden field is accepted', reason(msgFields('SFLPGMQ', 10, 'H'), msgFields('SFLPGMQ', 10, 'H')) === null);
// The add-message-subfile dialog writes the predefined fields with only a name,
// usage H and the keyword (no data type / length): the normal, accepted shape.
const bare = (kw, p, usage) => [dsp()].concat(sflRec('MSGSFL', [{ func: 'SFLMSGRCD(23)' }, { name: 'F1', usage, func: kw + (p ? '(' + p + ')' : '') }]));
check('predefined fields written with only name + keyword are accepted', reason(bare('SFLMSGKEY', '', 'H'), bare('SFLMSGKEY', '', 'H')) === null && reason(bare('SFLPGMQ', '', 'H'), bare('SFLPGMQ', '', 'H')) === null);
check('SFLPGMQ(276) predefines 276 bytes: length 276 accepted, 10 refused', reason(msgFields('SFLPGMQ', 276, 'H'), msgFields('SFLPGMQ(276)', 276, 'H')) === null && /length is 10/.test(reason([dsp()].concat(sflRec('MSGSFL', [{ func: 'SFLMSGRCD(23)' }])), msgFields('SFLPGMQ(276)', 10, 'H')) || ''));
check('a conflicting data type on a predefined field is refused', /data type is S/.test(reason(msgFields('SFLMSGKEY', 4, 'H'), [dsp()].concat(sflRec('MSGSFL', [{ func: 'SFLMSGRCD(23)' }, fld('F1', 4, 'S', 'H', 'SFLMSGKEY')]))) || ''));
check('SFLPGMQ on an output field is refused', /usage/.test(reason(msgFields('SFLPGMQ', 10, 'H'), msgFields('SFLPGMQ', 10, 'O')) || ''));

// renaming a predefined field that was already wrong is not a new violation
const renamed = (name) => [dsp()].concat(sflRec('MSGSFL', [{ func: 'SFLMSGRCD(23)' }, { name, dataType: 'A', length: '10', usage: 'H', func: 'SFLMSGKEY' }]));
check('renaming an already-invalid SFLMSGKEY field is not blocked', reason(renamed('MSGKEY'), renamed('MSGKEY2')) === null);

// ---- facts and wiring ----
check('refusals read their numbers from the spec', KeywordSpec.sflmodeField().length === 1 && KeywordSpec.messageSubfileFacts().predefinedFields.map((f) => f.length).join() === '4,10' && KeywordSpec.sflrnaRequires().join() === 'SFLINZ');
check('the guard is exported and used by the webview edit choke point', typeof DspfWriter.subfileKeywordNewConflictReason === 'function' && /subfileKeywordNewConflictReason/.test(require('fs').readFileSync(path.join(__dirname, '../buildWebviewTemplate.js'), 'utf8')));

console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : 'FAIL - ' + failureCount() + ' check(s) failed'));
process.exit(failureCount() === 0 ? 0 : 1);

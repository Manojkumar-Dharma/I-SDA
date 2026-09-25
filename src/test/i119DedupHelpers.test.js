/**
 * i119DedupHelpers.test.js
 *
 * Task I-119 (2026-09-21 audit, section 3) - de-duplicate several
 * copy-pasted helper pairs. Each pair below used to be two independent
 * implementations (one per file, or one per panel); this file checks the
 * one surviving implementation directly, plus that every original caller
 * still gets the same answer through its own name.
 *
 * escapeHtml specifically: the audit found two versions that escaped
 * different character sets (dspfEngine.js's own also escaped `'`;
 * webviewClientHelpers.js's own didn't, but was null/undefined-safe where
 * dspfEngine.js's own wasn't). The behaviour picked on purpose here is
 * "escape the full &/</>/"/' set AND treat null/undefined as ''" - see
 * DspfEngine.escapeHtml's own doc comment for the reasoning.
 *
 * Run with: node src/test/i119DedupHelpers.test.js
 */
const path = require('path');
const DspfEngine = require(path.join(__dirname, '../dspfEngine.js'));
global.DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const DspfWriter = global.DspfWriter;
const Helpers = require(path.join(__dirname, '../webviewClientHelpers.js'));

const { check, failureCount } = require('./helpers/harness');

// === escapeHtml: one canonical behaviour, reached two ways ===
console.log('\nescapeHtml: canonical behaviour (DspfEngine.escapeHtml and WebviewClientHelpers.escapeHtml)');
[DspfEngine.escapeHtml, Helpers.escapeHtml].forEach(function (fn, i) {
  const who = i === 0 ? 'DspfEngine' : 'WebviewClientHelpers';
  check(who + '.escapeHtml escapes &', fn('A & B') === 'A &amp; B');
  check(who + '.escapeHtml escapes <>', fn('<b>') === '&lt;b&gt;');
  check(who + '.escapeHtml escapes "', fn('say "hi"') === 'say &quot;hi&quot;');
  check(who + '.escapeHtml escapes \'', fn("it's") === 'it&#39;s');
  check(who + '.escapeHtml treats null as empty', fn(null) === '');
  check(who + '.escapeHtml treats undefined as empty', fn(undefined) === '');
  check(who + '.escapeHtml passes through a plain string', fn('plain') === 'plain');
});
check('DspfEngine.escapeHtml and WebviewClientHelpers.escapeHtml agree on a mixed string', DspfEngine.escapeHtml('<a href="x">it\'s & ok</a>') === Helpers.escapeHtml('<a href="x">it\'s & ok</a>'));

// === isPulldownRecord: one canonical implementation, defensive on both sides ===
console.log('\nisPulldownRecord: shared implementation (DspfEngine.isPulldownRecord / WebviewClientHelpers own)');
check('DspfEngine.isPulldownRecord true for a PULLDOWN record', DspfEngine.isPulldownRecord({ keywords: [{ name: 'PULLDOWN' }] }) === true);
check('DspfEngine.isPulldownRecord false without PULLDOWN', DspfEngine.isPulldownRecord({ keywords: [{ name: 'WINDOW' }] }) === false);
check('DspfEngine.isPulldownRecord tolerates a missing keywords array', DspfEngine.isPulldownRecord({}) === false);
check('WebviewClientHelpers.isPulldownRecord agrees (present)', Helpers.isPulldownRecord({ keywords: [{ name: 'PULLDOWN' }] }) === true);
check('WebviewClientHelpers.isPulldownRecord agrees (absent)', Helpers.isPulldownRecord({ keywords: [] }) === false);

// === parseScreenSizes / parseDisplaySizeTriples: single source ===
console.log('\nparseScreenSizes / parseDisplaySizeTriples: single source (dspfWriter.js delegates to DspfEngine)');
[
  ['24 80', [{ lines: 24, columns: 80, name: null }]],
  ['24 80 *DS3 27 132 *DS4', [{ lines: 24, columns: 80, name: '*DS3' }, { lines: 27, columns: 132, name: '*DS4' }]],
  ['*DS3 *DS4', [{ lines: 24, columns: 80, name: '*DS3' }, { lines: 27, columns: 132, name: '*DS4' }]],
  ['*DS4 *DS3', [{ lines: 27, columns: 132, name: '*DS4' }, { lines: 24, columns: 80, name: '*DS3' }]],
].forEach(function (pair) {
  const input = pair[0];
  const expected = JSON.stringify(pair[1]);
  const fromEngine = JSON.stringify(DspfEngine.parseScreenSizes(input));
  const fromWriter = JSON.stringify(DspfWriter.parseDisplaySizeTriples(input));
  check('DspfEngine.parseScreenSizes(' + JSON.stringify(input) + ') matches expected', fromEngine === expected);
  check('DspfWriter.parseDisplaySizeTriples(' + JSON.stringify(input) + ') agrees with DspfEngine', fromWriter === fromEngine);
});
check('DspfWriter.parseDisplaySizeTriples tolerates null (was already null-safe; DspfEngine.parseScreenSizes now is too)', JSON.stringify(DspfWriter.parseDisplaySizeTriples(null)) === '[]');
check('DspfEngine.parseScreenSizes tolerates null too (I-119 added this)', JSON.stringify(DspfEngine.parseScreenSizes(null)) === '[]');

// === getFileMsgLocLines/getSflMsgRcdLines + setters: shared generic implementation ===
console.log('\nMSGLOC/SFLMSGRCD getter-setter pairs: shared generic implementation');
{
  const afterMsgloc = DspfWriter.setFileMsgLocLines([], '24', { '*DS4': '28' });
  const readBack = DspfWriter.getFileMsgLocLines(afterMsgloc);
  check('setFileMsgLocLines/getFileMsgLocLines round-trip primary', readBack.primary === '24');
  check('setFileMsgLocLines/getFileMsgLocLines round-trip per-size', readBack.bySizeName['*DS4'] === '28');

  const afterSflmsgrcd = DspfWriter.setSflMsgRcdLines([], '5', { '*DS3': '6' });
  const readBack2 = DspfWriter.getSflMsgRcdLines(afterSflmsgrcd);
  check('setSflMsgRcdLines/getSflMsgRcdLines round-trip primary', readBack2.primary === '5');
  check('setSflMsgRcdLines/getSflMsgRcdLines round-trip per-size', readBack2.bySizeName['*DS3'] === '6');
  check('MSGLOC and SFLMSGRCD keywords do not leak into each other\'s getter', DspfWriter.getSflMsgRcdLines(afterMsgloc).primary === '');
}

// === nextAvailableFieldName/nextAvailableRecordName: shared generic search ===
console.log('\nnextAvailableFieldName/nextAvailableRecordName: shared generic search');
check('nextAvailableFieldName skips a used name', DspfWriter.nextAvailableFieldName({ fields: [{ name: 'FLD2' }] }, 'FLD') === 'FLD3');
check('nextAvailableRecordName skips a used name', DspfWriter.nextAvailableRecordName({ records: [{ name: 'REC2' }] }, 'REC') === 'REC3');
check('nextAvailableFieldName and nextAvailableRecordName do not share used-name state', DspfWriter.nextAvailableFieldName({ fields: [] }, 'FLD') === 'FLD2');

// === dupFloatNewConflictReason/blkfoldFloatNewConflictReason: shared generic check ===
console.log('\ndupFloatNewConflictReason/blkfoldFloatNewConflictReason: shared generic check');
{
  const dupReason = DspfWriter.dupFloatNewConflictReason({ dataType: 'A', keywords: [] }, { dataType: 'F', keywords: [{ name: 'DUP' }] });
  const blkfoldReason = DspfWriter.blkfoldFloatNewConflictReason({ dataType: 'A', keywords: [] }, { dataType: 'F', keywords: [{ name: 'BLKFOLD' }] });
  check('dupFloatNewConflictReason names DUP', typeof dupReason === 'string' && dupReason.indexOf('DUP') !== -1);
  check('blkfoldFloatNewConflictReason names BLKFOLD (not DUP)', typeof blkfoldReason === 'string' && blkfoldReason.indexOf('BLKFOLD') !== -1 && blkfoldReason.indexOf('DUP') === -1);
  check('dupFloatNewConflictReason allows an already-float+DUP field to be edited elsewhere', DspfWriter.dupFloatNewConflictReason({ dataType: 'F', keywords: [{ name: 'DUP' }] }, { length: 5 }) == null);
  check('blkfoldFloatNewConflictReason allows a non-float field with BLKFOLD to be edited elsewhere', DspfWriter.blkfoldFloatNewConflictReason({ dataType: 'A', keywords: [{ name: 'BLKFOLD' }] }, { length: 5 }) == null);
}

console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : failureCount() + ' CHECK(S) FAILED'));
process.exit(failureCount() === 0 ? 0 : 1);

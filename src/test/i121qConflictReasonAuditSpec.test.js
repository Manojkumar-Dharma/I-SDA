/**
 * i121qConflictReasonAuditSpec.test.js
 *
 * Task I-121q - audit of the *ConflictReason functions in dspfWriter.js.
 * Guards: (1) every such function appears in the audit table in
 * keywordFixes.md with a valid class, and the table lists no function that
 * no longer exists; (2) the two spec migrations are pure refactors.
 *
 * Run with: node src/test/i121qConflictReasonAuditSpec.test.js
 */
const fs = require('fs');
const path = require('path');
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const { check, failureCount } = require('./helpers/harness');
const j = (a) => JSON.stringify(a);

const writerSrc = fs.readFileSync(path.join(__dirname, '../dspfWriter.js'), 'utf8');
const doc = fs.readFileSync(path.join(__dirname, '../../docs/sda-reference/keywordFixes.md'), 'utf8');

console.log('\n=== 1. audit table covers every *ConflictReason function ===');
const inSource = new Set((writerSrc.match(/^  function (\w+ConflictReason)\(/gm) || [])
  .map((m) => m.replace(/^  function (\w+)\(/, '$1')));
const block = (doc.split('<!-- i121q-audit-table:start -->')[1] || '').split('<!-- i121q-audit-table:end -->')[0];
const rows = block.split('\n').map((l) => l.match(/^\| `(\w+)` \| ([^|]+) \|/)).filter(Boolean);
const inTable = new Map(rows.map((m) => [m[1], m[2].trim()]));
check('the table is present and non-empty', inTable.size > 0);
const missing = [...inSource].filter((n) => !inTable.has(n));
const stale = [...inTable.keys()].filter((n) => !inSource.has(n));
check('every function is in the table' + (missing.length ? ' (missing: ' + missing.join(', ') + ')' : ''), missing.length === 0);
check('the table lists no removed function' + (stale.length ? ' (stale: ' + stale.join(', ') + ')' : ''), stale.length === 0);
const VALID = ['spec-backed', 'procedural by design', 'needs a spec fact'];
check('every class is one of the three allowed', [...inTable.values()].every((c) => VALID.includes(c)));
check('nothing is left as "needs a spec fact"', [...inTable.values()].every((c) => c !== 'needs a spec fact'));
check('mnuBarKeyConflictReason (file-vs-record scoping) is in the table', inTable.has('mnuBarKeyConflictReason'));

console.log('\n=== 2. choice colour-state names come from the spec ===');
check('spec list equals the old literal, same order', j(KeywordSpec.choiceColorStateKeywords()) === j(['CHCAVAIL', 'CHCUNAVAIL', 'CHCSLT']));
check("choiceMenuBarViolations no longer holds its own copy", !/var STATE = \['CHCAVAIL'/.test(writerSrc));

console.log('\n=== 3. SFLCTL target lookup (sflctlTargetName) is unchanged ===');
// sfllinRecordEditConflictReason resolves the target through sflctlTargetName.
const fld = (n, kw) => ({ name: n, keywords: kw ? [{ name: kw, parameters: '' }] : [] });
const sflRec = { name: 'SFLREC', keywords: [], fields: [fld('F1', 'SFLCSRPRG')] };
const records = [sflRec];
const ctl = (params) => [{ name: 'SFLLIN', parameters: '' }, { name: 'SFLCTL', parameters: params }];
const reason = (params) => DspfWriter.sfllinRecordEditConflictReason({ keywords: [] }, ctl(params), records);
check('SFLCTL(SFLREC) is resolved', !!reason('(SFLREC)'));
// Behaviour kept exactly: only the outer text is trimmed, so a space inside the
// parentheses leaves the name unmatched (as before the refactor).
check('a space inside the parentheses is not matched (unchanged)', reason('( SFLREC )') === null);
check('bare name without parentheses is resolved', !!reason('SFLREC'));
check('an unknown target is not a conflict', reason('(NOPE)') === null);
check('empty SFLCTL parameters give no conflict', reason('') === null);
check('no SFLCTL keyword gives no conflict', DspfWriter.sfllinRecordEditConflictReason({ keywords: [] }, [{ name: 'SFLLIN', parameters: '' }], records) === null);

process.exit(failureCount() === 0 ? 0 : 1);

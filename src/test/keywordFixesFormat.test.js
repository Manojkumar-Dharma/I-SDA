/**
 * keywordFixesFormat.test.js
 *
 * Task I-205. docs/sda-reference/keywordFixes.md is the I-series task ledger. Its "Status at a glance" table, the
 * `**Status:**` line of each task section, the Open work table and the headline count had drifted apart (free-text
 * Status cells, Done rows with no Version, a dozen shapes of status line). This test pins the conventions written in the
 * document's "Status and version conventions" section, so a wrong cell fails npm test instead of waiting to be noticed.
 *
 * Run with: node src/test/keywordFixesFormat.test.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { check, failureCount } = require('./helpers/harness');

const ROOT = path.join(__dirname, '../..');
const DOC = fs.readFileSync(path.join(ROOT, 'docs/sda-reference/keywordFixes.md'), 'utf8');
const CHANGELOG = fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8');
const PKG = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;

const STATUSES = ['Open', 'In progress', 'Done', 'Done (no code change)', 'Done (no behaviour change)'];
const isDone = (s) => s.indexOf('Done') === 0;
const VERSION = /^v0\.\d+\.\d+$/;
const vnum = (v) => v.replace(/^v/, '').split('.').map(Number);
const cmpVer = (a, b) => { const x = vnum(a), y = vnum(b); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; };
const idKey = (id) => { const m = /^I-(\d+)([a-z]?)$/.exec(id); return m[1].padStart(5, '0') + m[2]; };

const lines = DOC.split('\n');
const at = (re) => lines.findIndex((l) => re.test(l));
const statusStart = at(/^## Status at a glance/);
const openStart = at(/^## Open work/);
const deferredStart = at(/^## Deferred findings/);
const detailsStart = at(/^## Task details/);

console.log('=== 1. Status at a glance: one well-formed row per task ===');
const rows = [];
for (let i = statusStart; i < openStart; i++) {
  const m = /^\| \[(I-\d+[a-z]?)\]\(#(i-\d+[a-z]?)\) \|/.exec(lines[i]);
  if (!m) continue;
  const cells = lines[i].trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((c) => c.trim());
  rows.push({ id: m[1], anchor: m[2], cells, line: i + 1 });
}
check('the table has rows', rows.length > 200);
check('every row has exactly six cells (ID, Area, Topic, Depends on, Status, Version)', rows.every((r) => r.cells.length === 6));
check('the anchor of every row is its lower-case ID', rows.every((r) => r.anchor === r.id.toLowerCase()));
check('no ID is listed twice', new Set(rows.map((r) => r.id)).size === rows.length);
check('rows are in strict ID order (a lettered slice follows its parent)', rows.every((r, i) => i === 0 || idKey(rows[i - 1].id) < idKey(r.id)));
const nums = rows.filter((r) => /^I-\d+$/.test(r.id)).map((r) => +r.id.slice(2));
check('the numbered IDs run 1..N with no gap', nums.every((n, i) => n === i + 1));
const bad = (f) => rows.filter((r) => !f(r)).map((r) => r.id + ' (' + r.cells[4].slice(0, 40) + ')').join(', ');
check('Status is one of the closed vocabulary' + (bad((r) => STATUSES.includes(r.cells[4])) ? ' - offenders: ' + bad((r) => STATUSES.includes(r.cells[4])) : ''), rows.every((r) => STATUSES.includes(r.cells[4])));
check('Version is vX.Y.Z or an em dash' + (bad((r) => VERSION.test(r.cells[5]) || r.cells[5] === '—') ? ' - offenders: ' + bad((r) => VERSION.test(r.cells[5]) || r.cells[5] === '—') : ''), rows.every((r) => VERSION.test(r.cells[5]) || r.cells[5] === '—'));
const noVer = (r) => isDone(r.cells[4]) && r.cells[5] === '—';
check('a Done row has a version; the only exception is a "Done (no code change)" row (I-1, the method task)' + (rows.filter((r) => noVer(r) && r.cells[4] !== 'Done (no code change)').length ? ' - offenders: ' + rows.filter((r) => noVer(r) && r.cells[4] !== 'Done (no code change)').map((r) => r.id).join(', ') : ''), rows.every((r) => !noVer(r) || r.cells[4] === 'Done (no code change)'));
check('...and that exception is used only once', rows.filter(noVer).length === 1 && noVer(rows[0]));
check('an Open or In progress row has no version yet', rows.every((r) => isDone(r.cells[4]) || r.cells[5] === '—'));

console.log('\n=== 2. headline: counts and version ===');
const head = /^(\d+) of (\d+) tasks done; (\d+) open \(see \[Open work\]\(#open-work\)\)\. Current version: \*\*(v\d+\.\d+\.\d+)\*\*\./m.exec(DOC);
check('the headline has the form "N of M tasks done; K open (...). Current version: **vX.Y.Z**."', !!head);
if (head) {
  const done = rows.filter((r) => isDone(r.cells[4])).length;
  check('M is the number of rows (' + rows.length + ')', +head[2] === rows.length);
  check('N is the number of Done rows (' + done + ')', +head[1] === done);
  check('K is the number of rows not Done (' + (rows.length - done) + ')', +head[3] === rows.length - done);
  const maxV = rows.map((r) => r.cells[5]).filter((v) => VERSION.test(v)).sort(cmpVer).pop();
  check('the headline version is not behind the newest version in the table (' + maxV + ')', cmpVer(head[4], maxV) >= 0);
  check('...and not ahead of package.json (' + PKG + ')', cmpVer(head[4], 'v' + PKG) <= 0);
}

console.log('\n=== 3. every version in the table is a released CHANGELOG entry ===');
const released = new Set((CHANGELOG.match(/^- \*\*0\.\d+\.\d+\*\*/gm) || []).map((s) => 'v' + s.replace(/^- \*\*|\*\*$/g, '')));
const unreleased = rows.map((r) => r.cells[5]).filter((v) => VERSION.test(v) && !released.has(v));
check('no table version is missing from CHANGELOG.md' + (unreleased.length ? ' - missing: ' + [...new Set(unreleased)].join(', ') : ''), unreleased.length === 0);

console.log('\n=== 4. task sections: one per row, in order, status line agrees with the table ===');
const sections = [];
let cur = null;
for (let i = detailsStart; i < lines.length; i++) {
  let m = /^### (I-\d+[a-z]?) /.exec(lines[i]);
  if (m) { cur = { id: m[1], line: i + 1, status: null }; sections.push(cur); continue; }
  m = /^> \*\*Area:\*\* .*? · \*\*Status:\*\* (.*?) · \*\*Depends on:\*\*/.exec(lines[i]);
  if (m && cur && cur.status === null) cur.status = m[1];
}
check('every row has a section and every section has a row, in the same order', sections.map((s) => s.id).join() === rows.map((r) => r.id).join());
check('every section has a Status line', sections.every((s) => s.status !== null));
const sec = {}; sections.forEach((s) => { sec[s.id] = s; });
const wrong = [];
rows.forEach((r) => {
  const s = sec[r.id] && sec[r.id].status;
  if (s === null || s === undefined) return;
  const st = r.cells[4], ver = r.cells[5];
  const expect = isDone(st) ? st + (ver === '—' ? '' : ' (' + ver + ')') : st;
  const ok = isDone(st) ? (s === expect || s.indexOf(expect + ' - ') === 0) : s === expect;
  if (!ok) wrong.push(r.id + ': "' + s.slice(0, 60) + '" vs "' + expect + '"');
});
check('each section status line is "<Status> (<version>)", with an optional " - note", matching its row' + (wrong.length ? ' - offenders: ' + wrong.slice(0, 6).join(' | ') : ''), wrong.length === 0);

console.log('\n=== 5. Open work lists exactly the tasks that are not Done ===');
const openRows = [];
for (let i = openStart; i < deferredStart; i++) {
  const m = /^\| (\d+) \| \[(I-\d+[a-z]?)\]\(#(i-\d+[a-z]?)\) \| ([^|]*) \|/.exec(lines[i]);
  if (m) openRows.push({ n: +m[1], id: m[2], status: m[4].trim() });
}
const notDone = rows.filter((r) => !isDone(r.cells[4]));
check('the Open work table has one row per task that is not Done, with the same status', openRows.map((r) => r.id + ':' + r.status).join() === notDone.map((r) => r.id + ':' + r.cells[4]).join());
check('its Order column counts 1, 2, 3 ...', openRows.every((r, i) => r.n === i + 1));
check('with no open task the section says "No tasks are open."', notDone.length > 0 || /^No tasks are open\.$/m.test(lines.slice(openStart, deferredStart).join('\n')));

console.log('\n=== 6. the conventions are written down ===');
check('the document has a "Status and version conventions" section naming this test', /^## Status and version conventions/m.test(DOC) && /keywordFixesFormat\.test\.js/.test(DOC));
check('...and lists every Status the test accepts', STATUSES.every((s) => DOC.indexOf('`' + s + '`') !== -1));

console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : 'FAIL - ' + failureCount() + ' check(s) failed'));
process.exit(failureCount() === 0 ? 0 : 1);

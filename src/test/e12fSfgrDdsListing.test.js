/**
 * E12f - the messages of the DDS that $SFGR generated, put back on the SFGR statement that made the DDS line. The four
 * recorded CRTDSPF listings (STIPFM, DDSEDGE, DDSLC, DBCS1) all compiled, so the messages are warnings; the layout of an
 * error-severity message is assumed to match and stays unverified until a failing run is recorded.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { check } = require('./helpers/harness');
const Dds = require('../sfgrDdsListing.js');
const CD = require('../compileDiagnostics.js');
const Listing = require('../compileListing.js');

const DIR = path.join(__dirname, '../../docs/sda-reference/source/compile-fixtures');
const read = (f) => fs.readFileSync(path.join(DIR, f), 'utf8');
const stipfm = fs.readFileSync(path.join(__dirname, '../../docs/sda-reference/source/stipfm.dspf36'), 'utf8');
const Parser = require('../sfgrParser.js');

console.log('the listing is read');
const sets = { stipfm: [stipfm, 15, 7], ddsedge: [read('ddsedge.dspf36'), 2, 1], ddslc: [read('ddslc.dspf36'), 2, 1], dbcs1: [read('dbcs1.dspf36'), 3, 2] };
Object.keys(sets).forEach((n) => {
  const text = read(n + '-dds-listing.txt');
  const p = Dds.parse(text);
  check(n + ': recognised as the DDS $SFGR generated', Dds.isGenerated(text) && p.generated && p.recognized);
  const occurrences = p.messages.reduce((a, m) => a + m.occurrences.length, 0);
  check('  every marker under a DDS line is counted as the Messages block says (' + occurrences + ')', occurrences === sets[n][1] && p.messages.every((m) => m.occurrences.length === m.count));
});
check('a plain DDS listing is not taken for a generated one', !Dds.isGenerated('5770SS1 V7R3M0 160422 Data Description QTEMP/X\nSource member containing DDS . . . : X.DSPF'));
check('STIPFM: 821 DDS lines with a reference column', Dds.parse(read('stipfm-dds-listing.txt')).lines.length === 821);

console.log('\nwhere they land');
const sLines = Parser.parse(stipfm).entries.filter((e) => e.kind === 'S').map((e) => e.line);
const st = Dds.toDiagnostics(Dds.parse(read('stipfm-dds-listing.txt')), stipfm);
check('STIPFM: the 15 warnings land on the 7 format lines of the source, one each', st.diagnostics.length === 7 && st.diagnostics.map((d) => d.line).join() === sLines.join());
check('  as warnings of CPD8018 with the text of the Messages block, placed, not file-level', st.diagnostics.every((d) => d.severity === 'warning' && d.code === 'CPD8018' && /DSPMOD/.test(d.message) && !d.fileLevel) && st.mapped === 7 && st.fileLevel === 0);
const db = Dds.toDiagnostics(Dds.parse(read('dbcs1-dds-listing.txt')), read('dbcs1.dspf36'));
check('DBCS1: the record-name message (CPD5235) is on the S line too', db.diagnostics.map((d) => d.code).sort().join() === 'CPD5235,CPD8018' && db.diagnostics.every((d) => d.line === 1));
check('the line the diagnostic marks is the whole SFGR line', st.diagnostics[0].column === 1 && st.diagnostics[0].endColumn === stipfm.split(/\r?\n/)[0].length + 1);

console.log('\nseverity and edge cases');
check('severity follows the listing legend: 0-9, 10-19, 20-29, 30-99', Dds.levelOf(0) === 'information' && Dds.levelOf(9) === 'information' && Dds.levelOf(10) === 'warning' && Dds.levelOf(19) === 'warning' && Dds.levelOf(20) === 'error' && Dds.levelOf(40) === 'error');
const made = Dds.parse(['Data Description Source', '  100 0007 A R F', '*                      CPD7B34-*****', '  200 9999 A FLD', '*   CPD7B34-', ' * * * * * E N D O F S O U R C E * * * * *',
  '   ID       Severity    Number', '* CPD7B34     30            2    Message . . . . :   Error found', '                                       in DDS.', '* CPC7301     00            1    Message . . . . :   File created.'].join('\n'));
const md = Dds.toDiagnostics(made, 'a\nb\nc\nd\ne\nf\ng\nh');
check('an error-severity message (assumed layout) is an error on its line; a reference past the source is file-level', md.diagnostics.length === 2 && md.diagnostics[0].severity === 'error' && md.diagnostics[0].line === 7 && md.diagnostics[1].fileLevel === true && md.fileLevel === 1);
check('  wrapped message text is joined; the completion message (severity 0, no marker) is not a diagnostic', /Error found in DDS\./.test(md.diagnostics[0].message) && !md.diagnostics.some((d) => d.code === 'CPC7301'));
check('junk input does not throw', [null, undefined, '', 42, {}].every((x) => { const p = Dds.parse(x); return p.recognized === false && Dds.toDiagnostics(p, 'x').diagnostics.length === 0; }));

(async () => {
  console.log('\nthe feedback flow');
  const real = Listing.fetchCompileListing;
  Listing.fetchCompileListing = async () => ({ ok: true, text: read('dbcs1-dds-listing.txt'), job: 'J1' });
  const out = await CD.collectCompileFeedback({ runSQL() {} }, { fileName: 'T.DSPF36', source: 'CRTS36DSPF', sourceText: read('dbcs1.dspf36'), mark: { since: '2026-01-01', user: 'U' }, commandText: '' }, {});
  check('CRTS36DSPF with the listing of the generated DDS: placed on the SFGR lines, not file-level', out.ok && out.sfgrDds === true && out.mapped === 2 && out.fileLevel === 0 && out.diagnostics.every((d) => d.line === 1));
  const other = await CD.collectCompileFeedback({ runSQL() {} }, { fileName: 'T.DSPF', source: 'CRTDSPF', sourceText: 'x', mark: {}, commandText: 'CPD7B34 Error found in DDS' }, {});
  check('a plain CRTDSPF run does not take this path', !other.sfgrDds);
  Listing.fetchCompileListing = real;
})();

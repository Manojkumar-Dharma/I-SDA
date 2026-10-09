/**
 * i199HlprcdHelpSpecRow.test.js
 *
 * Task I-199: the help-specification panel (a help entry's own "Application help" fields) had no
 * HLPRCD row, although I-190 made HLPRCD valid at help-specification level; an H-specification
 * HLPRCD could only be typed into the raw keyword editor. The row now exists (record format name,
 * optional library and file) and enforces the same file-wide exclusion with HLPPNLGRP the raw
 * editor's source guard does (hlprcdHspecConflictReason), in both directions.
 *
 * Covers the writer-level conflict function, then the real generated webview: the row is pre-filled
 * from the help entry's own HLPRCD, edits land on that help entry (not the record or file level),
 * the three part rules, turning it off, and both HLPPNLGRP directions across levels and records.
 * Run with: node src/test/i199HlprcdHelpSpecRow.test.js
 */
const DspfWriter = require('../../dist/dspfWriter.js');
const DspfParser = require('../../dist/dspfParser.js');
const { buildLine } = require('../fixtures/lineBuilder');
const { check, failureCount } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');

const k = (name, parameters) => ({ name, parameters: parameters || '', conditions: [] });

console.log('hlprcdHspecConflictReason: HLPPNLGRP / HLPRCD exclusion judged across the whole file');
{
  const elsewhere = (name) => ({ fileKeywords: [], records: [{ name: 'R1', helpEntries: [{ sourceLine: 99, keywords: [k(name, 'X')] }] }] });
  const atFile = (name) => ({ fileKeywords: [k(name, 'X')], records: [] });
  check('HLPRCD refused beside HLPPNLGRP on the same help specification', !!DspfWriter.hlprcdHspecConflictReason('HLPRCD', [k('HLPPNLGRP', 'P L M')], null, null));
  check('HLPRCD refused beside HLPPNLGRP on another help specification', !!DspfWriter.hlprcdHspecConflictReason('HLPRCD', [], elsewhere('HLPPNLGRP'), 1));
  check('HLPRCD refused beside a file-level HLPPNLGRP', !!DspfWriter.hlprcdHspecConflictReason('HLPRCD', [], atFile('HLPPNLGRP'), 1));
  check('HLPPNLGRP refused beside HLPRCD on the same help specification (reverse)', !!DspfWriter.hlprcdHspecConflictReason('HLPPNLGRP', [k('HLPRCD', 'H')], null, null));
  check('HLPPNLGRP refused beside HLPRCD on another help specification (reverse)', !!DspfWriter.hlprcdHspecConflictReason('HLPPNLGRP', [], elsewhere('HLPRCD'), 1));
  check('HLPPNLGRP refused beside a file-level HLPRCD (reverse)', !!DspfWriter.hlprcdHspecConflictReason('HLPPNLGRP', [], atFile('HLPRCD'), 1));
  check('the help entry\'s own sourceLine is excluded from the file-wide search', !DspfWriter.hlprcdHspecConflictReason('HLPRCD', [], elsewhere('HLPPNLGRP'), 99));
  check('HLPRCD beside HLPDOC is not refused (neither section excludes that pair)', !DspfWriter.hlprcdHspecConflictReason('HLPRCD', [k('HLPDOC', 'L D F')], elsewhere('HLPDOC'), 1));
  check('HLPRCD beside HLPRTN is not refused (a priority rule, not a prohibition)', !DspfWriter.hlprcdHspecConflictReason('HLPRCD', [k('HLPRTN')], null, null));
  check('nothing relevant present: no conflict', !DspfWriter.hlprcdHspecConflictReason('HLPRCD', [], { fileKeywords: [], records: [] }, null));
  check('a null model is handled', !DspfWriter.hlprcdHspecConflictReason('HLPPNLGRP', [], null, null));
  check('an unrelated keyword name never reports a conflict', !DspfWriter.hlprcdHspecConflictReason('DSPSIZ', [k('HLPPNLGRP', 'P')], null, null));
}

function openDom(src, nonce) {
  const html = webviewHtml('vscode-webview://fake', nonce, src, 'HLPRCD.DSPF');
  const posted = [];
  const alerts = [];
  const dom = newWebviewDom(html, {
    beforeParse(window) {
      window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
      window.alert = (m) => alerts.push(m);
    },
  });
  const doc = dom.window.document;
  const { Event } = dom.window;
  function gotoHelpEntry(recordName) {
    const sel = doc.getElementById('recordSelect');
    sel.value = recordName;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    Array.from(doc.querySelectorAll('.props-tab')).find((b) => b.textContent.trim() === 'Structure').dispatchEvent(new Event('click', { bubbles: true }));
    const row = doc.querySelector('.help-entry-row');
    row.dispatchEvent(new Event('click', { bubbles: true }));
    return 'help-' + row.getAttribute('data-source-line');
  }
  function fire(id, props) {
    const el = doc.getElementById(id);
    Object.assign(el, props || {});
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  const last = () => posted[posted.length - 1];
  const helpOf = (text, rec) => DspfParser.parseDspf(text).records.find((r) => r.name === rec).helpEntries[0].keywords;
  return { doc, posted, alerts, gotoHelpEntry, fire, last, helpOf };
}

let pending = 2;
function finish() {
  if (--pending > 0) return;
  console.log(failureCount() === 0 ? '\nALL CHECKS PASSED' : '\n' + failureCount() + ' CHECK(S) FAILED');
  process.exitCode = failureCount() === 0 ? 0 : 1;
}

console.log('\nReal designer: a help entry\'s own Application help panel now offers HLPRCD');
{
  // the HLPRCD continuation line keeps the keyword text inside the 80-column source line
  const src = [
    buildLine({ seq: '00010', nameType: 'R', name: 'SCREEN1' }),
    buildLine({ seq: '00020', line: '1', col: '2', func: "'First'" }),
    buildLine({ seq: '00030', nameType: 'H', func: 'HLPARA(*RCD)' }),
    buildLine({ seq: '00035', func: 'HLPRCD(HELPREC MYLIB/HELPF)' }),
    buildLine({ seq: '00040', nameType: 'R', name: 'SCREEN2' }),
    buildLine({ seq: '00050', line: '1', col: '2', func: "'Other'" }),
    buildLine({ seq: '00060', nameType: 'H', func: 'HLPARA(*RCD)' }),
  ].join('\n') + '\n';
  const t = openDom(src, 'testnonce199a');
  setTimeout(() => {
    const { doc } = t;
    let p = t.gotoHelpEntry('SCREEN1');
    check('the HLPRCD checkbox exists and starts checked', doc.getElementById(p + '-hlprcd-on') && doc.getElementById(p + '-hlprcd-on').checked);
    check('record, library and file are pre-filled from the help entry\'s own HLPRCD',
      doc.getElementById(p + '-hlprcd-record').value === 'HELPREC' && doc.getElementById(p + '-hlprcd-library').value === 'MYLIB' && doc.getElementById(p + '-hlprcd-file').value === 'HELPF');

    console.log('  editing a part re-commits into the help entry\'s own keywords');
    t.fire(p + '-hlprcd-record', { value: 'HELP2' });
    check('an edit was posted', t.last() && t.last().type === 'applyEdit');
    let kws = t.helpOf(t.last().text, 'SCREEN1');
    check('HLPRCD on the help entry carries the new record name and the same library/file', kws.some((x) => x.name === 'HLPRCD' && x.parameters.replace(/\s+/g, ' ').trim() === 'HELP2 MYLIB/HELPF'));
    check('the help entry\'s HLPARA is untouched', kws.some((x) => x.name === 'HLPARA'));
    const parsed = DspfParser.parseDspf(t.last().text);
    check('HLPRCD did not leak onto the record\'s own keywords or the file level', !parsed.records[0].keywords.some((x) => x.name === 'HLPRCD') && !parsed.fileKeywords.some((x) => x.name === 'HLPRCD'));

    console.log('  a blank record name while checked is refused, nothing posted');
    p = t.gotoHelpEntry('SCREEN1');
    let before = t.posted.length;
    t.fire(p + '-hlprcd-record', { value: '' });
    check('nothing new was posted', t.posted.length === before);
    check('an alert named the record format name rule', t.alerts.some((a) => /record format name/.test(a)));
    check('the checkbox is still checked', doc.getElementById(p + '-hlprcd-on').checked);

    console.log('  a library without a file name is refused, nothing posted');
    p = t.gotoHelpEntry('SCREEN1');
    before = t.posted.length;
    t.fire(p + '-hlprcd-file', { value: '' });
    check('nothing new was posted', t.posted.length === before);
    check('an alert named the library/file rule', t.alerts.some((a) => /library name only applies together with a file name/.test(a)));

    console.log('  HLPRCD with a file name and no library, and with record only, are both written');
    p = t.gotoHelpEntry('SCREEN1');
    t.fire(p + '-hlprcd-library', { value: '' });
    check('record + file written as "REC FILE"', t.helpOf(t.last().text, 'SCREEN1').some((x) => x.name === 'HLPRCD' && x.parameters.replace(/\s+/g, ' ').trim() === 'HELP2 HELPF'));
    p = t.gotoHelpEntry('SCREEN1');
    t.fire(p + '-hlprcd-file', { value: '' });
    check('record only written as "REC"', t.helpOf(t.last().text, 'SCREEN1').some((x) => x.name === 'HLPRCD' && x.parameters.trim() === 'HELP2'));

    console.log('  turning HLPRCD off removes it');
    p = t.gotoHelpEntry('SCREEN1');
    t.fire(p + '-hlprcd-on', { checked: false });
    check('HLPRCD was removed from the help entry', !t.helpOf(t.last().text, 'SCREEN1').some((x) => x.name === 'HLPRCD'));

    console.log('  adding HLPRCD on SCREEN2\'s help entry lands there, not on SCREEN1\'s');
    p = t.gotoHelpEntry('SCREEN2');
    check('the row starts unchecked on SCREEN2', !doc.getElementById(p + '-hlprcd-on').checked);
    doc.getElementById(p + '-hlprcd-record').value = 'ERRHELP';
    t.fire(p + '-hlprcd-on', { checked: true });
    kws = t.helpOf(t.last().text, 'SCREEN2');
    check('HLPRCD(ERRHELP) is on SCREEN2\'s help entry', kws.some((x) => x.name === 'HLPRCD' && x.parameters.trim() === 'ERRHELP'));
    check('SCREEN1\'s help entry has none', !t.helpOf(t.last().text, 'SCREEN1').some((x) => x.name === 'HLPRCD'));

    console.log('  checking the box with no record name is refused');
    p = t.gotoHelpEntry('SCREEN1');
    before = t.posted.length;
    t.fire(p + '-hlprcd-on', { checked: true });
    check('nothing posted, checkbox reverted to unchecked', t.posted.length === before && !doc.getElementById(p + '-hlprcd-on').checked);
    check('HLPRCD\'s Conditioning toggle exists (option indicators are valid for it)', !!doc.querySelector('.kw-cond-toggle[data-flag-id="' + p + '-hlprcd"]'));
    finish();
  }, 0);
}

console.log('\nReal designer: HLPPNLGRP / HLPRCD exclusion across levels and records, both directions');
{
  // file-level HLPPNLGRP; SCREEN1's help entry tries to turn HLPRCD on.
  const withFile = [
    buildLine({ seq: '00005', func: 'HLPPNLGRP(PNLGRP MYLIB MODULE)' }),
    buildLine({ seq: '00010', nameType: 'R', name: 'SCREEN1' }),
    buildLine({ seq: '00020', line: '1', col: '2', func: "'First'" }),
    buildLine({ seq: '00030', nameType: 'H', func: 'HLPARA(*RCD)' }),
  ].join('\n') + '\n';
  const a = openDom(withFile, 'testnonce199b');
  // HLPRCD on SCREEN1's help entry; SCREEN2's help entry tries to turn HLPPNLGRP on.
  const withRcd = [
    buildLine({ seq: '00010', nameType: 'R', name: 'SCREEN1' }),
    buildLine({ seq: '00020', line: '1', col: '2', func: "'First'" }),
    buildLine({ seq: '00030', nameType: 'H', func: 'HLPARA(*RCD) HLPRCD(HELPREC)' }),
    buildLine({ seq: '00040', nameType: 'R', name: 'SCREEN2' }),
    buildLine({ seq: '00050', line: '1', col: '2', func: "'Other'" }),
    buildLine({ seq: '00060', nameType: 'H', func: 'HLPARA(*RCD)' }),
  ].join('\n') + '\n';
  const b = openDom(withRcd, 'testnonce199c');
  setTimeout(() => {
    console.log('  a file-level HLPPNLGRP blocks turning HLPRCD on at a help specification');
    let p = a.gotoHelpEntry('SCREEN1');
    a.doc.getElementById(p + '-hlprcd-record').value = 'HELPREC';
    const before = a.posted.length;
    a.fire(p + '-hlprcd-on', { checked: true });
    check('blocked: nothing posted', a.posted.length === before);
    check('the checkbox reverted to unchecked', !a.doc.getElementById(p + '-hlprcd-on').checked);
    check('the alert names the file-wide exclusion', a.alerts.some((m) => /HLPRCD cannot be specified in the same display file as HLPPNLGRP/.test(m)));

    console.log('  an HLPRCD on another help specification blocks turning HLPPNLGRP on');
    p = b.gotoHelpEntry('SCREEN2');
    const before2 = b.posted.length;
    b.fire(p + '-hlppnlgrp-on', { checked: true });
    check('blocked: nothing posted', b.posted.length === before2);
    check('the HLPPNLGRP checkbox reverted to unchecked', !b.doc.getElementById(p + '-hlppnlgrp-on').checked);
    check('the alert names the file-wide exclusion', b.alerts.some((m) => /HLPPNLGRP cannot be specified in the same display file as HLPRCD/.test(m)));

    console.log('  the same help specification\'s own HLPRCD blocks HLPPNLGRP too');
    p = b.gotoHelpEntry('SCREEN1');
    const before3 = b.posted.length;
    b.fire(p + '-hlppnlgrp-on', { checked: true });
    check('blocked: nothing posted', b.posted.length === before3);
    finish();
  }, 0);
}

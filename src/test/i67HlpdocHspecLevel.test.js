/**
 * i67HlpdocHspecLevel.test.js
 *
 * Task I-67 (docs/sda-reference/keywordFixes.md) - HLPDOC's help-
 * specification-level form. I-38 only ever added the file-level form,
 * deferring this one - same "file-level only, H-spec-level deferred"
 * precedent I-5's own HLPRCD entry already set for that keyword.
 *
 * Covers, at the dspfWriter.js level: hlpdocHspecConflictReason (HLPBDY
 * same-specification guard, HLPPNLGRP file-wide guard, no HLPRTN check
 * per I-90's own research) and anyHelpKeywordPresentInFile (the file-wide
 * search it's built on). At the real-generated-webview level (same
 * rationale as i38HlpdocFileLevel.test.js and i68HlprtnReverseGuard.test.js -
 * the generic dspfWriter.js primitives already worked before this task,
 * so testing them alone would prove nothing about whether the H-spec's
 * own Application Help panel actually offers HLPDOC): the new row exists
 * pre-filled from the H-spec's own keywords, commits to the help entry's
 * own keywords (not the record's or file's), enforces the all-three-parts-
 * required rule, and is blocked/blocks in both directions against HLPBDY
 * (same spec) and HLPPNLGRP (file-wide - checked against another
 * record's H-spec AND the file level). Fails against pre-I-67 code (none
 * of these ids/functions existed) while passing against the fix.
 * Run with: node src/test/i67HlpdocHspecLevel.test.js
 */
const DspfWriter = require('../../dist/dspfWriter.js');
const DspfParser = require('../../dist/dspfParser.js');
const { buildLine } = require('../fixtures/lineBuilder');

const { check, failureCount } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');

// --- dspfWriter.js-level: anyHelpKeywordPresentInFile ---
console.log('anyHelpKeywordPresentInFile: searches file-level keywords + every record\'s help entries');
{
  const model = {
    fileKeywords: [{ name: 'HELP', parameters: '', conditions: [] }],
    records: [
      { name: 'R1', helpEntries: [{ sourceLine: 10, keywords: [{ name: 'HLPARA', parameters: '*RCD', conditions: [] }] }] },
      { name: 'R2', helpEntries: [{ sourceLine: 20, keywords: [{ name: 'HLPPNLGRP', parameters: 'M G', conditions: [] }] }] },
    ],
  };
  check('finds a file-level keyword', DspfWriter.anyHelpKeywordPresentInFile(model, 'HELP', null));
  check('finds a keyword on a help entry on ANY record, not just the first', DspfWriter.anyHelpKeywordPresentInFile(model, 'HLPPNLGRP', null));
  check('does not find an absent keyword', !DspfWriter.anyHelpKeywordPresentInFile(model, 'HLPDOC', null));
  check('excludes the help entry named by ownSourceLine', !DspfWriter.anyHelpKeywordPresentInFile(model, 'HLPPNLGRP', 20));
  check('still finds it on other records when ownSourceLine names a different one', DspfWriter.anyHelpKeywordPresentInFile(model, 'HLPPNLGRP', 10));
  check('a null model is handled without throwing', !DspfWriter.anyHelpKeywordPresentInFile(null, 'HELP', null));
}

// --- dspfWriter.js-level: hlpdocHspecConflictReason ---
console.log('\nhlpdocHspecConflictReason: HLPBDY same-spec, HLPPNLGRP file-wide, no HLPRTN check (I-90)');
{
  const ownWithHlpbdy = [{ name: 'HLPBDY', parameters: '', conditions: [] }];
  check('HLPDOC conflicts when HLPBDY is on the SAME help specification', !!DspfWriter.hlpdocHspecConflictReason('HLPDOC', ownWithHlpbdy, null, null));
  check('HLPBDY conflicts when HLPDOC is on the SAME help specification (reverse)', !!DspfWriter.hlpdocHspecConflictReason('HLPBDY', [{ name: 'HLPDOC', parameters: 'L D F', conditions: [] }], null, null));

  const modelWithHlppnlgrpElsewhere = {
    fileKeywords: [],
    records: [{ name: 'R1', helpEntries: [{ sourceLine: 99, keywords: [{ name: 'HLPPNLGRP', parameters: 'M G', conditions: [] }] }] }],
  };
  check('HLPDOC conflicts when HLPPNLGRP exists on a DIFFERENT help specification (file-wide)', !!DspfWriter.hlpdocHspecConflictReason('HLPDOC', [], modelWithHlppnlgrpElsewhere, 1));
  const modelWithHlppnlgrpAtFileLevel = { fileKeywords: [{ name: 'HLPPNLGRP', parameters: 'M G', conditions: [] }], records: [] };
  check('HLPDOC conflicts when HLPPNLGRP exists at the FILE level (file-wide)', !!DspfWriter.hlpdocHspecConflictReason('HLPDOC', [], modelWithHlppnlgrpAtFileLevel, 1));

  const modelWithHlpdocElsewhere = {
    fileKeywords: [],
    records: [{ name: 'R1', helpEntries: [{ sourceLine: 99, keywords: [{ name: 'HLPDOC', parameters: 'L D F', conditions: [] }] }] }],
  };
  check('HLPPNLGRP conflicts when HLPDOC exists elsewhere in the file (reverse, file-wide)', !!DspfWriter.hlpdocHspecConflictReason('HLPPNLGRP', [], modelWithHlpdocElsewhere, 1));
  check('HLPPNLGRP conflicts when HLPDOC is on the SAME help specification too', !!DspfWriter.hlpdocHspecConflictReason('HLPPNLGRP', [{ name: 'HLPDOC', parameters: 'L D F', conditions: [] }], null, null));

  check('no conflict when nothing relevant is present anywhere', !DspfWriter.hlpdocHspecConflictReason('HLPDOC', [], { fileKeywords: [], records: [] }, null));
  check('an unrelated keyword name never reports a conflict', !DspfWriter.hlpdocHspecConflictReason('DSPSIZ', ownWithHlpbdy, null, null));
  check('HLPDOC does NOT check HLPRTN at the H-spec level (I-90\'s own recommendation)', !DspfWriter.hlpdocHspecConflictReason('HLPDOC', [{ name: 'HLPRTN', parameters: '', conditions: [] }], null, null));
}

// --- Real generated webview: a HELP entry's own Application Help panel ---
console.log('\nReal designer: a HELP entry\'s own Application Help panel now offers HLPDOC');
{
  const src =
    [
      buildLine({ seq: '00010', nameType: 'R', name: 'SCREEN1' }),
      buildLine({ seq: '00020', line: '1', col: '2', func: "'First'" }),
      buildLine({ seq: '00030', nameType: 'H', func: "HLPARA(*RCD) HLPDOC(LBL1 DOC1 FLD1)" }),
      buildLine({ seq: '00040', nameType: 'R', name: 'SCREEN2' }),
      buildLine({ seq: '00050', line: '1', col: '2', func: "'Other'" }),
      buildLine({ seq: '00060', nameType: 'H', func: "HLPBDY" }),
    ].join('\n') + '\n';
  const html = webviewHtml('vscode-webview://fake', 'testnonce67', src, 'HLPDOC.DSPF');
  const posted = [];
  const dom = newWebviewDom(html, {
    beforeParse(window) {
      window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
      window.alert = () => {};
    },
  });

  setTimeout(() => {
    const doc = dom.window.document;
    const { Event } = dom.window;
    const recordSelect = doc.getElementById('recordSelect');

    // commitHelpEdit (buildWebviewTemplate.js) deliberately deselects and
    // returns to the record view after every SUCCESSFUL edit ("help
    // entries have no stable name to re-find by") - a fresh full re-render,
    // so any DOM element handle grabbed before a successful commit is
    // stale afterwards. This helper re-navigates and re-fetches a fresh
    // element handle every time, rather than reusing one across commits.
    function gotoHelpEntry(recordName) {
      recordSelect.value = recordName;
      recordSelect.dispatchEvent(new Event('change', { bubbles: true }));
      Array.from(doc.querySelectorAll('.props-tab')).find((b) => b.textContent.trim() === 'Structure').dispatchEvent(new Event('click', { bubbles: true }));
      const row = doc.querySelector('.help-entry-row');
      row.dispatchEvent(new Event('click', { bubbles: true }));
      return 'help-' + row.getAttribute('data-source-line');
    }

    let hpPrefix = gotoHelpEntry('SCREEN1');
    check('one help entry row listed for SCREEN1', !!hpPrefix);

    console.log('  HLPDOC row exists, pre-filled from this H-spec\'s own already-present HLPDOC');
    check('the HLPDOC checkbox exists and starts checked', doc.getElementById(hpPrefix + '-hlpdoc-on').checked);
    check('its three parts are pre-filled from the source', doc.getElementById(hpPrefix + '-hlpdoc-label').value === 'LBL1' && doc.getElementById(hpPrefix + '-hlpdoc-document').value === 'DOC1' && doc.getElementById(hpPrefix + '-hlpdoc-folder').value === 'FLD1');

    console.log('  editing a part re-commits it into the help entry\'s own keywords, not the record\'s or file\'s');
    doc.getElementById(hpPrefix + '-hlpdoc-document').value = 'DOC1CHANGED';
    doc.getElementById(hpPrefix + '-hlpdoc-document').dispatchEvent(new Event('change', { bubbles: true }));
    let applyEdit = posted[posted.length - 1];
    check('an edit was posted', applyEdit && applyEdit.type === 'applyEdit');
    let reparsed = DspfParser.parseDspf(applyEdit.text).records.find((r) => r.name === 'SCREEN1');
    check('HLPDOC landed on the help entry with the new document name', reparsed.helpEntries[0].keywords.some((k) => k.name === 'HLPDOC' && /DOC1CHANGED/.test(k.parameters)));
    check('the H-spec\'s own pre-existing HLPARA is untouched', reparsed.helpEntries[0].keywords.some((k) => k.name === 'HLPARA'));
    check('HLPDOC did not leak onto the record\'s own top-level keywords', !reparsed.keywords.some((k) => k.name === 'HLPDOC'));

    console.log('  requires all three parts - blanking one back out while still checked is refused, nothing posted');
    hpPrefix = gotoHelpEntry('SCREEN1');
    let postedBefore = posted.length;
    doc.getElementById(hpPrefix + '-hlpdoc-folder').value = '';
    doc.getElementById(hpPrefix + '-hlpdoc-folder').dispatchEvent(new Event('change', { bubbles: true }));
    check('nothing new was posted', posted.length === postedBefore);
    check('the checkbox reverted to checked (still present in the model)', doc.getElementById(hpPrefix + '-hlpdoc-on').checked);

    console.log('  turning HLPDOC OFF is never blocked, even with a conflicting keyword');
    doc.getElementById(hpPrefix + '-hlpdoc-on').checked = false;
    doc.getElementById(hpPrefix + '-hlpdoc-on').dispatchEvent(new Event('change', { bubbles: true }));
    applyEdit = posted[posted.length - 1];
    reparsed = DspfParser.parseDspf(applyEdit.text).records.find((r) => r.name === 'SCREEN1');
    check('HLPDOC was removed from the help entry', !reparsed.helpEntries[0].keywords.some((k) => k.name === 'HLPDOC'));

    console.log('  re-adding HLPDOC (checkbox + all three parts) succeeds again');
    hpPrefix = gotoHelpEntry('SCREEN1');
    doc.getElementById(hpPrefix + '-hlpdoc-label').value = 'LBL1';
    doc.getElementById(hpPrefix + '-hlpdoc-document').value = 'DOC1';
    doc.getElementById(hpPrefix + '-hlpdoc-folder').value = 'FLD1';
    doc.getElementById(hpPrefix + '-hlpdoc-on').checked = true;
    doc.getElementById(hpPrefix + '-hlpdoc-on').dispatchEvent(new Event('change', { bubbles: true }));
    applyEdit = posted[posted.length - 1];
    check('HLPDOC is back on the help entry', DspfParser.parseDspf(applyEdit.text).records.find((r) => r.name === 'SCREEN1').helpEntries[0].keywords.some((k) => k.name === 'HLPDOC'));

    console.log('  HLPBDY guard: turning HLPBDY on while HLPDOC is present on the SAME spec is blocked');
    hpPrefix = gotoHelpEntry('SCREEN1');
    const postedBeforeHlpbdy = posted.length;
    doc.getElementById(hpPrefix + '-hlpbdy-on').checked = true;
    doc.getElementById(hpPrefix + '-hlpbdy-on').dispatchEvent(new Event('change', { bubbles: true }));
    check('HLPBDY was blocked (same-spec conflict with HLPDOC) - nothing new posted', posted.length === postedBeforeHlpbdy);
    check('the HLPBDY checkbox reverted to unchecked', !doc.getElementById(hpPrefix + '-hlpbdy-on').checked);

    console.log('  HLPPNLGRP guard: turning HLPPNLGRP on while HLPDOC exists on a DIFFERENT help specification (SCREEN2) is blocked file-wide');
    const postedBeforePnlgrp = posted.length;
    doc.getElementById(hpPrefix + '-hlppnlgrp-on').checked = true;
    doc.getElementById(hpPrefix + '-hlppnlgrp-on').dispatchEvent(new Event('change', { bubbles: true }));
    check('HLPPNLGRP was blocked (file-wide conflict with SCREEN1\'s own HLPDOC) - nothing new posted', posted.length === postedBeforePnlgrp);
    check('the HLPPNLGRP checkbox reverted to unchecked', !doc.getElementById(hpPrefix + '-hlppnlgrp-on').checked);

    console.log('  reverse: SCREEN2\'s own HLPBDY blocks HLPDOC from turning on there (same-spec)');
    const hp2Prefix = gotoHelpEntry('SCREEN2');
    check('HLPBDY starts checked on SCREEN2\'s own H-spec', doc.getElementById(hp2Prefix + '-hlpbdy-on').checked);
    doc.getElementById(hp2Prefix + '-hlpdoc-label').value = 'L2';
    doc.getElementById(hp2Prefix + '-hlpdoc-document').value = 'D2';
    doc.getElementById(hp2Prefix + '-hlpdoc-folder').value = 'F2';
    const postedBeforeHlpdoc2 = posted.length;
    doc.getElementById(hp2Prefix + '-hlpdoc-on').checked = true;
    doc.getElementById(hp2Prefix + '-hlpdoc-on').dispatchEvent(new Event('change', { bubbles: true }));
    check('HLPDOC was blocked on SCREEN2 (same-spec conflict with its own HLPBDY) - nothing new posted', posted.length === postedBeforeHlpdoc2);
    check('the HLPDOC checkbox reverted to unchecked', !doc.getElementById(hp2Prefix + '-hlpdoc-on').checked);

    console.log(failureCount() === 0 ? '\nALL CHECKS PASSED' : '\n' + failureCount() + ' CHECK(S) FAILED');
    process.exitCode = failureCount() === 0 ? 0 : 1;
  }, 0);
}

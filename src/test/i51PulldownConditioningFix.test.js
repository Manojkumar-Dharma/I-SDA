/**
 * i51PulldownConditioningFix.test.js
 *
 * Task I-51 - `wirePulldownGuardedFlag` (added by I-13) never wired a
 * live Conditioning toggle at all, for any of its callers. Several of
 * its own rows already pass a real `conditions` value into `flagRowHtml`
 * (so the toggle button renders), and are individually documented
 * "Option indicators are valid/allowed for this keyword" - but clicking
 * the toggle did nothing, because `wireFlagRowConditioning` was never
 * called for this function's own rows.
 *
 * Independently re-verified every `wirePulldownGuardedFlag` caller
 * against the DDS Reference while implementing this (not just trusting
 * I-51's own original keywordFixes.md list): confirmed 13 genuinely need
 * the fix - `ALARM`, `ALWGPH`, `FRCDTA`, `HLPCLR`, `INVITE`, `OVERLAY`,
 * `PUTRETAIN`, `PUTOVR`, `OVRDTA`, `OVRATR`, `MDTOFF`, `ERASEINP`,
 * `ERASE` - and that 4 are correctly excluded already - `INZRCD`,
 * `SLNO`, `CLRL`, `RTNDTA` are each individually documented "Option
 * indicators are not valid for this keyword," and their own rows
 * already pass `undefined` for `conditions` (no toggle rendered at all,
 * so nothing to fix). This corrects I-51's own original list two ways:
 * `RTNDTA` was named there but re-verification found it already
 * correctly excluded (no bug); `HLPCLR` and `INVITE` were NOT named
 * there despite having the identical dead-toggle symptom - added here.
 *
 * Same method as dspfWebview.test.js's own BLINK/SFLDSP conditioning
 * scenarios: click the `.kw-cond-toggle`, click `.cond-add-group` to
 * start a pending OR-condition, fill in an indicator number, click
 * `.cond-ind-add` to commit it, then confirm the reparsed DDS actually
 * carries that condition. Runs the DSPF designer's real generated
 * client-side script in jsdom.
 * Run with: node src/test/i51PulldownConditioningFix.test.js
 */
const DspfParser = require('../../dist/dspfParser.js');

const { check, failureCount } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');

const dspfSource =
  [
    '     A                                      DSPSIZ(24 80 *DS3)',
    '     A          R SCR1',
    "     A                                  1  2'MAIN SCREEN'",
  ].join('\n') + '\n';

const html = webviewHtml('vscode-webview://fake', 'testnonce', dspfSource, 'MYSCR.DSPF');

let posted = [];
const dom = newWebviewDom(html, {
  beforeParse(window) {
    window.acquireVsCodeApi = () => ({
      getState: () => null,
      setState: () => {},
      postMessage: (m) => posted.push(m),
    });
    window.alert = () => {};
  },
});

setTimeout(() => {
  const { document: doc, Event } = dom.window;

  const recordSelect = doc.getElementById('recordSelect');
  check('setup: the record dropdown is present', !!recordSelect);
  recordSelect.value = 'SCR1';
  recordSelect.dispatchEvent(new Event('change', { bubbles: true }));

  const p = 'rk-SCR1';

  function reparsedRecord(text) {
    return DspfParser.parseDspf(text).records.find((r) => r.name === 'SCR1');
  }

  // Turn a keyword on (its checkbox), then click through the toggle ->
  // + OR condition -> fill indicator -> commit flow, and confirm the
  // resulting DDS genuinely carries the condition.
  function checkConditioningWorks(suffix, name, indicatorNumber) {
    const box = doc.getElementById(p + '-' + suffix + '-on');
    check('setup: ' + name + ' checkbox is present', !!box);
    if (!box) return;
    posted.length = 0;
    box.checked = true;
    box.dispatchEvent(new Event('change', { bubbles: true }));
    let applyEdit = posted.find((m) => m.type === 'applyEdit');
    check(name + ' turns on normally', !!applyEdit);
    check(name + ' actually present in the rewritten DDS', !!applyEdit && reparsedRecord(applyEdit.text).keywords.some((k) => k.name === name));
    posted.length = 0;

    const toggle = doc.querySelector('.kw-cond-toggle[data-flag-id="' + p + '-' + suffix + '"]');
    check(name + ' has a Conditioning toggle', !!toggle);
    if (!toggle) return;
    check(name + ' starts with no Conditioning shown as already set (0)', /Conditioning(?!\s*\(\d)/.test(toggle.textContent));
    toggle.dispatchEvent(new Event('click', { bubbles: true }));
    const addGroupBtn = doc.querySelector('.cond-add-group[data-prefix="' + p + '-' + suffix + '-cond"]');
    check(name + ": toggle click reveals the editor (+ OR condition button appears)", !!addGroupBtn);
    if (!addGroupBtn) return;
    addGroupBtn.dispatchEvent(new Event('click', { bubbles: true }));
    check('clicking + OR condition on ' + name + ' does not write yet (pending, not committed)', posted.length === 0);
    const pendingNumInput = doc.querySelector('.cond-group[data-group="pending"] .cond-ind-num');
    check(name + ': pending indicator-number input is present', !!pendingNumInput);
    if (!pendingNumInput) return;
    pendingNumInput.value = indicatorNumber;
    doc.querySelector('.cond-ind-add[data-prefix="' + p + '-' + suffix + '-cond"][data-group="pending"]').dispatchEvent(new Event('click', { bubbles: true }));
    applyEdit = posted.find((m) => m.type === 'applyEdit');
    check(name + ': committing the pending indicator posts an applyEdit (this is the actual I-51 fix - previously this click did nothing)', !!applyEdit);
    const kw = applyEdit && reparsedRecord(applyEdit.text).keywords.find((k) => k.name === name);
    check(name + ' is now conditioned on indicator ' + indicatorNumber, !!kw && kw.conditions.length === 1 && kw.conditions[0].indicators[0].number === indicatorNumber);
    posted.length = 0;
    check('re-rendering shows the Conditioning(1) summary on the ' + name + ' row, not hidden', /Conditioning\s*\(1\)/.test(doc.querySelector('.kw-cond-toggle[data-flag-id="' + p + '-' + suffix + '"]').textContent));
  }

  console.log('\nAll 13 genuinely-in-scope wirePulldownGuardedFlag keywords: Conditioning toggle now actually commits an indicator (previously a dead control)');
  [
    ['hlpclr', 'HLPCLR', '21'],
    ['alarm', 'ALARM', '22'],
    ['invite', 'INVITE', '23'],
    ['alwgph', 'ALWGPH', '24'],
    ['frcdta', 'FRCDTA', '25'],
    ['overlay', 'OVERLAY', '26'],
    ['putretain', 'PUTRETAIN', '27'],
    ['putovr', 'PUTOVR', '28'],
    ['ovrdta', 'OVRDTA', '29'],
    ['ovratr', 'OVRATR', '30'],
    ['mdtoff', 'MDTOFF', '31'],
    ['eraseinp', 'ERASEINP', '32'],
    ['erase', 'ERASE', '33'],
  ].forEach(function (t) {
    checkConditioningWorks(t[0], t[1], t[2]);
  });

  console.log('\nconfirmed NOT-valid wirePulldownGuardedFlag keywords still correctly offer no Conditioning toggle (no regression, and I-51\'s own original list wrongly included RTNDTA here - re-verified against its own DDS Reference text and excluded)');
  ['inzrcd', 'slno', 'clrl', 'rtndta'].forEach(function (suffix) {
    check(suffix.toUpperCase() + ' has no Conditioning toggle', !doc.querySelector('.kw-cond-toggle[data-flag-id="' + p + '-' + suffix + '"]'));
  });

  if (failureCount() === 0) {
    console.log('\nALL CHECKS PASSED');
  } else {
    console.log('\n' + failureCount() + ' CHECK(S) FAILED');
    process.exitCode = 1;
  }
}, 500);

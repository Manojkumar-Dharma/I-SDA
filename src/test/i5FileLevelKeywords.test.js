/**
 * i5FileLevelKeywords.test.js
 *
 * Task I-5 (docs/sda-reference/keywordFixes.md) - 4 of the 5
 * confirmed-missing file-level keywords actually needed new code:
 * HLPRCD, MOUBTN, VALNUM, WRDWRAP (the 5th, ROLLUP/ROLLDOWN, turned out to
 * already be correctly implemented as PAGEDOWN/PAGEUP alt names - see
 * fileKeywordsPicker.test.js's own ROLLUP/ROLLDOWN section, unchanged here).
 *
 * fileKeywordsPicker.test.js already covers the generic dspfWriter.js
 * primitives these 4 reuse (getFileFlagKeyword/setFileFlagKeyword,
 * getRepeatableKeywordInstances/setRepeatableKeywordInstances) - those
 * primitives already worked for arbitrary keyword names before this task,
 * so testing them alone would prove nothing about whether the FIX (the
 * File Properties UI actually offering these 4 keywords at all) is really
 * there. This file runs the DSPF designer's real generated client-side
 * script in jsdom instead - same rationale as s36eUiHardBlocks.test.js -
 * and fails against the pre-I-5 code (none of these ids existed) while
 * passing against the fix.
 * Run with: node src/test/i5FileLevelKeywords.test.js
 */
const { JSDOM } = require('jsdom');
const { getWebviewHtml } = require('../../dist/webviewTemplate.js');

let failures = 0;
function check(label, condition) {
  if (condition) {
    console.log('  ok  -', label);
  } else {
    failures++;
    console.log('FAIL  -', label);
  }
}

const dspfSource =
  [
    '     A                                      DSPSIZ(24 80 *DS3)',
    '     A          R SCR1',
    "     A                                  1  2'MAIN SCREEN'",
  ].join('\n') + '\n';

const html = getWebviewHtml('vscode-webview://fake', 'testnonce', dspfSource, 'MYSCR.DSPF').replace(
  /<meta http-equiv="Content-Security-Policy"[^>]*>/,
  ''
);

const posted = [];
const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  resources: 'usable',
  pretendToBeVisual: true,
  beforeParse(window) {
    window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
    window.alert = () => {};
  },
});

function lastEdit() {
  for (let i = posted.length - 1; i >= 0; i--) {
    if (posted[i] && posted[i].type === 'applyEdit') return posted[i];
  }
  return null;
}

setTimeout(() => {
  const { document: doc, Event } = dom.window;

  console.log('setup: switch to File Properties, then the General panel');
  const fileCrumb = doc.getElementById('crumb-file');
  check('file breadcrumb is present', !!fileCrumb);
  fileCrumb.dispatchEvent(new Event('click', { bubbles: true }));

  console.log('\nVALNUM: row exists on the General panel and has no Conditioning toggle (option indicators are not valid per IBM\'s own reference)');
  {
    const valnumOn = doc.getElementById('fk-valnum-on');
    check('VALNUM checkbox is present', !!valnumOn);
    check('VALNUM row renders no conditioning toggle', !doc.querySelector('[data-cond-toggle-for="fk-valnum"]') && !doc.querySelector('.kw-cond-toggle[data-for="fk-valnum"]'));

    valnumOn.checked = true;
    valnumOn.dispatchEvent(new Event('change', { bubbles: true }));
    const edit = lastEdit();
    check('checking it posts an edit that adds VALNUM', edit && /\bVALNUM\b/.test(edit.text));
    posted.length = 0;
  }

  console.log('\nWRDWRAP: row exists on the General panel, same "plain flag" shape as VALNUM');
  {
    const wrdwrapOn = doc.getElementById('fk-wrdwrap-on');
    check('WRDWRAP checkbox is present', !!wrdwrapOn);
    wrdwrapOn.checked = true;
    wrdwrapOn.dispatchEvent(new Event('change', { bubbles: true }));
    const edit = lastEdit();
    check('checking it posts an edit that adds WRDWRAP', edit && /\bWRDWRAP\b/.test(edit.text));
    posted.length = 0;
  }

  console.log('\nHLPRCD: switch to the Help tab, fill in record/library/file, checkbox drives presence');
  {
    const helpTab = doc.querySelector('.props-tab[data-tab="help"]');
    check('Help tab button is present', !!helpTab);
    helpTab.dispatchEvent(new Event('click', { bubbles: true }));

    const on = doc.getElementById('fk-hlprcd-on');
    const record = doc.getElementById('fk-hlprcd-record');
    const library = doc.getElementById('fk-hlprcd-library');
    const file = doc.getElementById('fk-hlprcd-file');
    check('HLPRCD checkbox + record/library/file fields are all present', !!on && !!record && !!library && !!file);

    record.value = 'HELPFMT';
    record.dispatchEvent(new Event('change', { bubbles: true }));
    check('typing a record name alone (checkbox still off) does not yet post HLPRCD', !lastEdit() || !/HLPRCD/.test(lastEdit().text));

    on.checked = true;
    on.dispatchEvent(new Event('change', { bubbles: true }));
    let edit = lastEdit();
    check('ticking the checkbox posts HLPRCD with the record name already typed', edit && /HLPRCD\(HELPFMT\)/.test(edit.text));
    posted.length = 0;

    library.value = 'MYLIB';
    library.dispatchEvent(new Event('change', { bubbles: true }));
    file.value = 'MYFILE';
    file.dispatchEvent(new Event('change', { bubbles: true }));
    edit = lastEdit();
    check('library/file are joined with a slash after the record name', edit && /HLPRCD\(HELPFMT MYLIB\/MYFILE\)/.test(edit.text));
    posted.length = 0;
  }

  console.log('\nMOUBTN: switch to the Indicator tab, add a row, edit it, then remove it');
  {
    const indicatorTab = doc.querySelector('.props-tab[data-tab="indicator"]');
    check('Indicator tab button is present', !!indicatorTab);
    indicatorTab.dispatchEvent(new Event('click', { bubbles: true }));

    const addBtn = Array.prototype.slice.call(doc.querySelectorAll('button')).find((b) => /mouse button event/i.test(b.textContent || ''));
    check('"+ Add mouse button event" button is present', !!addBtn);
    addBtn.dispatchEvent(new Event('click', { bubbles: true }));

    const keyInput = doc.querySelector('input[class$="-key"]');
    check('a new MOUBTN instance row rendered with a Command key/EVENT-ID input', !!keyInput);
    let edit = lastEdit();
    check('adding the row itself already posted a (default) MOUBTN instance', edit && /MOUBTN/.test(edit.text));
    posted.length = 0;

    const eventSel = doc.querySelector('select[class$="-event"]');
    const queueSel = doc.querySelector('select[class$="-queue"]');
    check('the row exposes an EVENT selector and a QUEUE selector', !!eventSel && !!queueSel);
    eventSel.value = '*UMP';
    eventSel.dispatchEvent(new Event('change', { bubbles: true }));
    keyInput.value = 'CF03';
    keyInput.dispatchEvent(new Event('change', { bubbles: true }));
    queueSel.value = '*QUEUE';
    queueSel.dispatchEvent(new Event('change', { bubbles: true }));
    edit = lastEdit();
    check('editing EVENT/key/QUEUE round-trips into the posted MOUBTN parameters', edit && /MOUBTN\(\*UMP CF03 \*QUEUE\)/.test(edit.text));
    posted.length = 0;

    const removeBtn = Array.prototype.slice.call(doc.querySelectorAll('button')).find((b) => /\u00d7/.test(b.textContent || '') || /remove/i.test(b.getAttribute('title') || ''));
    if (removeBtn) {
      removeBtn.dispatchEvent(new Event('click', { bubbles: true }));
      edit = lastEdit();
      check('removing the only instance drops MOUBTN entirely', !edit || !/MOUBTN/.test(edit.text));
    } else {
      check('a Remove control exists for the instance row', false);
    }
  }

  console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
  process.exit(failures === 0 ? 0 : 1);
}, 0);

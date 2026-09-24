/**
 * i115SflmsgKeywordsTab.test.js
 *
 * Task I-115 (docs/sda-reference/keywordFixes.md), raised by I-105 - an SFLMSG
 * (message subfile) record's Keywords tab still showed the full R1 row set even
 * though the message-subfile whitelist (SFL + SFLMSGRCD only) refused every
 * row. Decision (Warrior): the same "hide every non-applicable row" rule as
 * I-105, but keep the tab's raw editor and Conditioning accordions (so a
 * hand-written keyword is still listed and removable) - i.e. hide all rows,
 * drop the subtab strip, do NOT drop the tab.
 *
 * Part 1 mounts the helpers directly (recordKeywordsRestriction,
 * recordRestrictionAllows, recordKeywordsPanelsHtml, the raw editor). Part 2
 * runs the real generated template in jsdom (renderRecordProps).
 * Run with: node src/test/i115SflmsgKeywordsTab.test.js
 */
const path = require('path');
const { JSDOM } = require('jsdom');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));

const { check, failureCount } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>');
global.document = dom.window.document;
global.Node = dom.window.Node;
global.window = dom.window;
global.DspfWriter = DspfWriter;
const Helpers = require(path.join(__dirname, '../webviewClientHelpers.js'));
const kwd = (name, parameters) => ({ name, parameters: parameters || '', conditions: [], raw: '', sourceLines: [] });
const PANELS = ['general', 'indicatorKeywords', 'help', 'output', 'input', 'overlay', 'print'];
const SFLMSG = [kwd('SFL'), kwd('SFLMSGRCD', '23')];

// ===========================================================================
console.log('Part 1 - helpers');
{
  console.log('  which whitelist governs the record');
  check('SFL + SFLMSGRCD -> SFLMSG', Helpers.recordKeywordsRestriction({ keywords: SFLMSG }) === 'SFLMSG');
  check('SFLMSGRCD alone (no SFL keyword) -> SFLMSG', Helpers.recordKeywordsRestriction({ keywords: [kwd('SFLMSGRCD', '23')] }) === 'SFLMSG');
  check('a plain SFL record is still SFL', Helpers.recordKeywordsRestriction({ keywords: [kwd('SFL')] }) === 'SFL');
  check('USRDFN still wins', Helpers.recordKeywordsRestriction({ keywords: [kwd('USRDFN'), kwd('SFLMSGRCD', '5')] }) === 'USRDFN');
  check('MNUBAR / plain / SFLCTL unchanged',
    Helpers.recordKeywordsRestriction({ keywords: [kwd('MNUBAR')] }) === 'MNUBAR' &&
    Helpers.recordKeywordsRestriction({ keywords: [] }) === null &&
    Helpers.recordKeywordsRestriction({ keywords: [kwd('SFLCTL')] }) === null);

  console.log('  recordRestrictionAllows(SFLMSG, ...) mirrors the writer whitelist');
  check('SFL and SFLMSGRCD are the only allowed names',
    Helpers.recordRestrictionAllows('SFLMSG', 'SFL') && Helpers.recordRestrictionAllows('SFLMSG', 'SFLMSGRCD'));
  const ROW_KEYWORDS = ['KEEP', 'INZRCD', 'ASSUME', 'ALWROL', 'CHGINPDFT', 'TEXT', 'ALTNAME', 'CLEAR', 'HOME', 'HELP', 'HLPRTN',
    'VLDCMDKEY', 'SETOF', 'CHANGE', 'INDTXT', 'LOGOUT', 'LOGINP', 'CHECK', 'UNLOCK', 'OVERLAY', 'PRINT', 'HLPCLR', 'INVITE',
    'MNUBARDSP', 'MOUBTN', 'RTNCSRLOC', 'ENTFLDATR', 'CSRLOC', 'PROTECT'];
  check('every keyword a row can write is refused (' + ROW_KEYWORDS.length + ' checked)',
    ROW_KEYWORDS.every((n) => !Helpers.recordRestrictionAllows('SFLMSG', n)));
  check('the row gate and the writer guard agree for every one of them',
    ROW_KEYWORDS.every((n) => Helpers.recordRestrictionAllows('SFLMSG', n) === !DspfWriter.sflWhitelistConflictReason(n, SFLMSG)));
  check('no restriction still allows everything', Helpers.recordRestrictionAllows(null, 'KEEP') && Helpers.recordRestrictionAllows(undefined, 'CLEAR'));

  console.log('  the panels');
  const restricted = Helpers.recordKeywordsPanelsHtml(SFLMSG, 'rec', new Set(), 'SFLMSG');
  check('all seven panels come back empty (so every subtab is dropped)', PANELS.every((k) => restricted[k] === ''));
  const full = Helpers.recordKeywordsPanelsHtml(SFLMSG, 'rec', new Set());
  check('without the restriction the full row set is still built (contrast)', PANELS.every((k) => full[k] !== '') && /id="rec-keep-on"/.test(full.general));
  const idsIn = (panels) => new dom.window.DOMParser().parseFromString('<body>' + PANELS.map((k) => panels[k]).join('') + '</body>', 'text/html').querySelectorAll('[id]').length;
  check('the restricted view renders no element with an id at all', idsIn(restricted) === 0);

  console.log('  hand-written keywords stay reachable in the raw editor');
  const withStray = SFLMSG.concat([kwd('INZRCD')]);
  check('the raw editor still lists a hand-written INZRCD',
    /INZRCD/.test(Helpers.keywordEditorHtml(withStray, 'record-X', new Set())));
  check('...and the restricted panels still show nothing for it', PANELS.every((k) => Helpers.recordKeywordsPanelsHtml(withStray, 'rec', new Set(), 'SFLMSG')[k] === ''));
}

// ===========================================================================
console.log('Part 2 - the real template (renderRecordProps)');
{
    const { buildLine } = require('../fixtures/lineBuilder');
  const src =
    [
      buildLine({ seq: '00010', nameType: 'R', name: 'SFLMESS', func: 'SFL' }),
      buildLine({ seq: '00020', func: 'SFLMSGRCD(24)' }),
      buildLine({ seq: '00030', name: 'MSGKEY', dataType: 'A', length: '10', usage: 'H' }),
      buildLine({ seq: '00040', func: 'SFLMSGKEY' }),
      buildLine({ seq: '00050', name: 'PGMQ', dataType: 'A', length: '10', usage: 'H' }),
      buildLine({ seq: '00060', func: 'SFLPGMQ(276)' }),
      buildLine({ seq: '00070', nameType: 'R', name: 'PLAIN' }),
      buildLine({ seq: '00080', name: 'FLD1', dataType: 'A', length: '5', usage: 'B', line: '1', col: '1' }),
      buildLine({ seq: '00090', nameType: 'R', name: 'SFLONLY', func: 'SFL' }),
      buildLine({ seq: '00100', name: 'SFLFLD', dataType: 'A', length: '5', usage: 'B', line: '2', col: '2' }),
    ].join('\n') + '\n';
  const html = webviewHtml('vscode-webview://fake', 'testnonce16', src, 'SFLMSG.DSPF');
  const errors = [];
  const wdom = newWebviewDom(html, {
    beforeParse(window) {
      window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: () => {} });
      window.addEventListener('error', (e) => errors.push(String(e.message)));
    },
  });

  setTimeout(() => {
    const doc = wdom.window.document;
    const { Event } = wdom.window;
    const recordSelect = doc.getElementById('recordSelect');
    const pick = (name) => { recordSelect.value = name; recordSelect.dispatchEvent(new Event('change', { bubbles: true })); };
    const tab = (label) => Array.from(doc.querySelectorAll('.props-tab')).find((b) => b.textContent.trim() === label);
    const kwPanel = () => {
      const btn = tab('Keywords');
      if (btn) btn.dispatchEvent(new Event('click', { bubbles: true }));
      return doc.querySelector('.props-tab-panel.active') || doc.getElementById('propsBody');
    };

    console.log('  an SFLMSG record: Keywords tab kept, subtab strip gone, escape hatches stay');
    pick('SFLMESS');
    check('the Keywords tab button is still there', !!tab('Keywords'));
    const panel = kwPanel();
    const kwHtml = panel.innerHTML;
    check('no subtab strip (General / Indicator / ... buttons) on the Keywords tab', panel.querySelectorAll('.props-subtab').length === 0);
    check('no base-record rows (KEEP / INZRCD / ALTNAME / TEXT) on the Keywords tab',
      !panel.querySelector('#rk-SFLMESS-keep-on') && !panel.querySelector('#rk-SFLMESS-inzrcd-on') && !panel.querySelector('#rk-SFLMESS-altname') && !panel.querySelector('#rk-SFLMESS-text'));
    check('an explanatory hint replaces them', /No record keyword rows apply to this record type/.test(kwHtml));
    check('the "Advanced / raw keywords" accordion is still there', /Advanced \/ raw keywords/.test(kwHtml));
    check('the record-level "Conditioning" accordion is still there', />Conditioning</.test(kwHtml) || /Conditioning/.test(kwHtml));
    check('the SFLMSG tab is untouched', !!tab('SFLMSG'));
    const sm = tab('SFLMSG'); sm.dispatchEvent(new Event('click', { bubbles: true }));
    check('its Message Record panel still renders (SFLMSGRCD line pre-filled)', (doc.getElementById('sm-sflmsgrcd') || {}).value === '24');
    check('the SFLMSG tab hints point at the Keywords tab, not "below" / the removed KEEP row',
      /raw Keywords editor \(Keywords tab\)/.test(doc.body.innerHTML) && /a message-subfile record accepts only SFLMSGRCD/.test(doc.body.innerHTML));

    console.log('  other record types keep their subtabs');
    pick('PLAIN');
    const plainPanel = kwPanel();
    check('a plain record still has all 7 subtabs', plainPanel.querySelectorAll('.props-subtab').length === 7);
    check('...and no empty-state hint', !/No record keyword rows apply/.test(plainPanel.innerHTML));
    pick('SFLONLY');
    const sflPanel = kwPanel();
    check('a plain SFL record keeps its I-105 subtabs (General / Indicator / Output / Input)', sflPanel.querySelectorAll('.props-subtab').length === 4);

    console.log('  no script errors while rendering');
    check('no uncaught errors in the webview', errors.length === 0);

    console.log('');
    if (failureCount() > 0) { console.log(failureCount() + ' CHECK(S) FAILED'); process.exit(1); }
    console.log('ALL CHECKS PASSED');
    process.exit(0);
  }, 500);
}

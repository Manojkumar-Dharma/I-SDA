/**
 * i114UsrdfnIndicatorSubtab.test.js
 *
 * Task I-114 (docs/sda-reference/keywordFixes.md), raised by I-105 - HELP and
 * HLPRTN are on a USRDFN record's closed whitelist and live in the record-
 * indicator list, but R2 kept the Indicator subtab off a USRDFN record, so they
 * were reachable only through the raw keyword editor (the same gap INVITE had).
 * Decision: I-105's own rule - "show every applicable row" - so a USRDFN record
 * now gets an Indicator subtab limited to those two kinds (a deliberate
 * departure from real SDA's USRDFN menu, which has no Indicator category).
 *
 * Part 1 mounts recordKeywordsPanelsHtml(..., 'USRDFN') / wireRecordKeywordsPanels
 * directly; Part 2 runs the real generated template in jsdom.
 * Run with: node src/test/i114UsrdfnIndicatorSubtab.test.js
 */
const path = require('path');
const { JSDOM } = require('jsdom');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));

let failures = 0;
function check(label, condition) {
  if (condition) console.log('  ok  -', label);
  else { failures++; console.log('FAIL  -', label); }
}

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>');
global.document = dom.window.document;
global.Node = dom.window.Node;
global.window = dom.window;
global.DspfWriter = DspfWriter;
const Helpers = require(path.join(__dirname, '../webviewClientHelpers.js'));
const ev = (n) => new dom.window.Event(n, { bubbles: true });
const kwd = (name, parameters) => ({ name, parameters: parameters || '', conditions: [], raw: '', sourceLines: [] });
const PANELS = ['general', 'indicatorKeywords', 'help', 'output', 'input', 'overlay', 'print'];
const KINDS = ['CLEAR', 'PAGEDOWN', 'PAGEUP', 'HOME', 'HELP', 'HLPRTN', 'VLDCMDKEY', 'SETOF', 'CHANGE', 'INDTXT'];
const USRDFN = [kwd('USRDFN')];

function mount(keywords, restrictTo) {
  const st = { keywords, changes: 0, alerts: [] };
  const expanded = new Set();
  const root = document.getElementById('root');
  function render() {
    const panels = Helpers.recordKeywordsPanelsHtml(st.keywords, 'rec', expanded, restrictTo);
    root.innerHTML = PANELS.map((k) => '<div data-panel="' + k + '">' + panels[k] + '</div>').join('');
    Helpers.wireRecordKeywordsPanels('rec', () => st.keywords, (next) => { st.keywords = next; st.changes++; render(); }, expanded, render, () => []);
  }
  window.alert = (m) => st.alerts.push(String(m));
  render();
  return st;
}
const kindsOf = (st) => st.keywords.filter((k) => KINDS.indexOf(k.name) >= 0).map((k) => k.name + '(' + k.parameters + ')');
const addBtn = () => document.querySelector('.repeat-inst-add[data-prefix="rec-recind-rep"]');
const kindSels = () => Array.from(document.querySelectorAll('select[class$="-kind"]'));
const optionsOf = (sel) => Array.from(sel.options).map((o) => o.value);

// ===========================================================================
console.log('Part 1 - helpers');
{
  console.log('  the panel');
  const panels = Helpers.recordKeywordsPanelsHtml(USRDFN, 'rec', new Set(), 'USRDFN');
  check('the Indicator panel is no longer empty on a USRDFN record', panels.indicatorKeywords !== '');
  check('...and says only HELP / HLPRTN apply (not the generic "CLEAR rows" / "CA/CF keys" text)',
    /accepts only HELP/.test(panels.indicatorKeywords) && !/CLEAR rows/.test(panels.indicatorKeywords) && !/CA\/CF/.test(panels.indicatorKeywords));
  check('General, Help and Print panels are still there', panels.general !== '' && panels.help !== '' && panels.print !== '');
  check('Output, Input and Overlay panels are still dropped', panels.output === '' && panels.input === '' && panels.overlay === '');
  check('no MOUBTN (not on the whitelist) inside the Indicator panel', !/moubtn/i.test(panels.indicatorKeywords));

  console.log('  the rows: reachable and limited to HELP / HLPRTN');
  const st = mount(USRDFN, 'USRDFN');
  check('the "+ Add indicator keyword" button is rendered', !!addBtn());
  addBtn().dispatchEvent(ev('click'));
  check('Add creates HELP(10), no alert', kindsOf(st).join() === 'HELP(10)' && st.alerts.length === 0);
  check('the kind selector offers exactly HELP and HLPRTN', kindSels().length === 1 && optionsOf(kindSels()[0]).join() === 'HELP,HLPRTN');
  kindSels()[0].value = 'HLPRTN';
  kindSels()[0].dispatchEvent(ev('change'));
  check('HELP -> HLPRTN commits, no alert', kindsOf(st).join() === 'HLPRTN(10)' && st.alerts.length === 0);
  addBtn().dispatchEvent(ev('click'));
  check('a second row can be added (repeatable)', kindsOf(st).length === 2 && st.alerts.length === 0);

  console.log('  a hand-written out-of-list row still renders truthfully');
  const hand = mount(USRDFN.concat([kwd('CLEAR', '55')]), 'USRDFN');
  check('the CLEAR(55) row is listed, keeping its own kind in the selector',
    kindSels().length === 1 && kindSels()[0].value === 'CLEAR' && optionsOf(kindSels()[0]).join() === 'CLEAR,HELP,HLPRTN');
  check('...nothing was rewritten just by rendering it', hand.changes === 0 && kindsOf(hand).join() === 'CLEAR(55)');

  console.log('  the same panel on other record types is unchanged');
  const plain = Helpers.recordKeywordsPanelsHtml([], 'rec', new Set());
  check('a plain record keeps the generic status text and all ten kinds',
    /CA\/CF command keys/.test(plain.indicatorKeywords) && !/accepts only HELP/.test(plain.indicatorKeywords));
  const sfl = mount([kwd('SFL')], 'SFL');
  addBtn().dispatchEvent(ev('click'));
  check('SFL: still adds CHANGE and lists only the SFL kinds', kindsOf(sfl).join() === 'CHANGE(10)' && optionsOf(kindSels()[0]).indexOf('HELP') < 0);
  check('SFL panel still uses the generic text', /CA\/CF command keys/.test(Helpers.recordKeywordsPanelsHtml([kwd('SFL')], 'rec', new Set(), 'SFL').indicatorKeywords));
  const mnu = mount([kwd('MNUBAR')], 'MNUBAR');
  addBtn().dispatchEvent(ev('click'));
  check('MNUBAR: still its own 8 kinds (CLEAR default, HELP included, SETOF / CHANGE not) - unchanged',
    kindsOf(mnu).join() === 'CLEAR(10)' && optionsOf(kindSels()[0]).join() === 'CLEAR,HOME,PAGEDOWN,PAGEUP,HELP,HLPRTN,VLDCMDKEY,INDTXT');
}

// ===========================================================================
console.log('Part 2 - the real template (renderRecordProps)');
{
  const { getWebviewHtml } = require('../../dist/webviewTemplate.js');
  const { buildLine } = require('../fixtures/lineBuilder');
  const DspfParser = require('../../dist/dspfParser.js');
  const src =
    [
      buildLine({ seq: '00010', nameType: 'R', name: 'USERDEFN', func: 'USRDFN' }),
      buildLine({ seq: '00020', name: 'FLD1', dataType: 'A', length: '5', usage: 'B', line: '1', col: '1' }),
      buildLine({ seq: '00030', nameType: 'R', name: 'PLAIN' }),
      buildLine({ seq: '00040', name: 'FLD2', dataType: 'A', length: '5', usage: 'B', line: '1', col: '1' }),
      buildLine({ seq: '00050', nameType: 'R', name: 'SFLONLY', func: 'SFL' }),
      buildLine({ seq: '00060', name: 'FLD3', dataType: 'A', length: '5', usage: 'B', line: '2', col: '2' }),
    ].join('\n') + '\n';
  const html = getWebviewHtml('vscode-webview://fake', 'testnonce16', src, 'USRDFN.DSPF').replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, '');
  const posted = [];
  const errors = [];
  const wdom = new JSDOM(html, {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
      window.addEventListener('error', (e) => errors.push(String(e.message)));
    },
  });

  setTimeout(() => {
    const doc = wdom.window.document;
    const { Event } = wdom.window;
    const recordSelect = doc.getElementById('recordSelect');
    const pick = (name) => { recordSelect.value = name; recordSelect.dispatchEvent(new Event('change', { bubbles: true })); };
    const openKeywords = () => {
      Array.from(doc.querySelectorAll('.props-tab')).find((b) => b.textContent.trim() === 'Keywords').dispatchEvent(new Event('click', { bubbles: true }));
      return Array.from(doc.querySelectorAll('.props-subtab')).map((b) => b.textContent.trim());
    };
    const lastEdit = () => posted.filter((m) => m.type === 'applyEdit').slice(-1)[0];
    const usrKeywords = () => DspfParser.parseDspf(lastEdit().text).records.find((r) => r.name === 'USERDEFN').keywords.map((k) => k.name + '(' + k.parameters.trim() + ')');

    console.log('  a USRDFN record');
    pick('USERDEFN');
    const labels = openKeywords();
    check('4 subtabs: General, Indicator, Help, Print (in that order)', labels.join() === 'General,Indicator,Help,Print');
    check('Output / Input / Overlay are still absent', !labels.includes('Output') && !labels.includes('Input') && !labels.includes('Overlay'));
    const ind = Array.from(doc.querySelectorAll('.props-subtab')).find((b) => b.textContent.trim() === 'Indicator');
    ind.dispatchEvent(new Event('click', { bubbles: true }));
    const add = doc.querySelector('.repeat-inst-add[data-prefix="rk-USERDEFN-recind-rep"]');
    check('the Indicator subtab has the "+ Add indicator keyword" button', !!add);
    add.dispatchEvent(new Event('click', { bubbles: true }));
    check('Add posts an edit that writes HELP(10) on the USRDFN record (USRDFN itself untouched)',
      !!lastEdit() && usrKeywords().includes('HELP(10)') && usrKeywords().includes('USRDFN()'));
    const sel = doc.querySelector('select[class^="rk-USERDEFN-recind-rep"][class$="-kind"]') || Array.from(doc.querySelectorAll('select')).find((s) => /-kind$/.test(s.className));
    check('the row\'s kind selector lists exactly HELP and HLPRTN', !!sel && Array.from(sel.options).map((o) => o.value).join() === 'HELP,HLPRTN');
    if (sel) {
      sel.value = 'HLPRTN';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      check('switching to HLPRTN writes HLPRTN(10) and drops HELP', usrKeywords().includes('HLPRTN(10)') && !usrKeywords().includes('HELP(10)'));
    }

    console.log('  other record types keep their subtabs');
    pick('PLAIN');
    check('a plain record still has all 7 subtabs', openKeywords().length === 7);
    pick('SFLONLY');
    check('a plain SFL record still has its 4 I-105 subtabs', openKeywords().join() === 'General,Indicator,Output,Input');

    console.log('  no script errors while rendering');
    check('no uncaught errors in the webview', errors.length === 0);

    console.log('');
    if (failures > 0) { console.log(failures + ' CHECK(S) FAILED'); process.exit(1); }
    console.log('ALL CHECKS PASSED');
    process.exit(0);
  }, 500);
}

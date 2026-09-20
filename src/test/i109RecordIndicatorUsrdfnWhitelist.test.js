/**
 * i109RecordIndicatorUsrdfnWhitelist.test.js
 *
 * Task I-109 - the record-level Indicator row ("+ Add indicator keyword" and
 * the per-row kind dropdown) never ran USRDFN's closed whitelist (I-104
 * finding D): on a USRDFN record it accepted CLEAR (the Add default), PAGEDOWN,
 * PAGEUP, HOME, VLDCMDKEY, SETOF, CHANGE and INDTXT - only HELP and HLPRTN are
 * on USRDFN's list. Fixed in recordIndicatorKindConflictReason, which both
 * paths use, so the Add now defaults to HELP on a USRDFN record.
 *
 * The I-104 sweep covers the accept/refuse matrix; this file pins the
 * specifics: the Add default per record type (unchanged everywhere else), the
 * message and revert on a refused switch, and that editing a row that ALREADY
 * exists on a hand-written record is not blocked (only a real change of kind is
 * checked).
 * Run with: node src/test/i109RecordIndicatorUsrdfnWhitelist.test.js
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

function mount(keywords) {
  const st = { keywords, changes: 0, alerts: [] };
  const expanded = new Set();
  const root = document.getElementById('root');
  function render() {
    const panels = Helpers.recordKeywordsPanelsHtml(st.keywords, 'rec', expanded);
    root.innerHTML = PANELS.map((k) => '<div data-panel="' + k + '">' + panels[k] + '</div>').join('');
    Helpers.wireRecordKeywordsPanels('rec', () => st.keywords, (next) => { st.keywords = next; st.changes++; render(); }, expanded, render, () => []);
  }
  window.alert = (m) => st.alerts.push(String(m));
  render();
  return st;
}
const kindOf = (st) => st.keywords.filter((k) => KINDS.indexOf(k.name) >= 0).map((k) => k.name);
const addBtn = () => document.querySelector('.repeat-inst-add[data-prefix="rec-recind-rep"]');
const kindSel = () => document.querySelector('select[class$="-kind"]');
const respBox = () => document.querySelector('input[class$="-resp"]');

console.log('"+ Add indicator keyword" - the default kind per record type');
{
  const usr = mount([kwd('USRDFN')]);
  check('the Add button exists on a USRDFN record (reachable)', !!addBtn());
  addBtn().dispatchEvent(ev('click'));
  check('USRDFN: no alert', usr.alerts.length === 0);
  check('USRDFN: the Add creates HELP - not CLEAR (CLEAR is not on USRDFN\'s list)', kindOf(usr).join() === 'HELP');
  check('USRDFN: it is written as HELP(10) - a real, writable instance', usr.keywords.some((k) => k.name === 'HELP' && k.parameters === '10'));

  const plain = mount([]);
  addBtn().dispatchEvent(ev('click'));
  check('plain record: default is still CLEAR', kindOf(plain).join() === 'CLEAR' && plain.alerts.length === 0);

  const sfl = mount([kwd('SFL')]);
  addBtn().dispatchEvent(ev('click'));
  check('SFL record: default unchanged (CHANGE - the first kind on SFL\'s list)', kindOf(sfl).join() === 'CHANGE' && sfl.alerts.length === 0);

  const mnu = mount([kwd('MNUBAR')]);
  addBtn().dispatchEvent(ev('click'));
  check('MNUBAR record: default unchanged (CLEAR)', kindOf(mnu).join() === 'CLEAR' && mnu.alerts.length === 0);

  const pd = mount([kwd('PULLDOWN')]);
  addBtn().dispatchEvent(ev('click'));
  check('PULLDOWN record: still avoids CLEAR (HOME)', kindOf(pd).join() === 'HOME' && pd.alerts.length === 0);
}

console.log('\nswitching a row\'s kind on a USRDFN record');
{
  ['CLEAR', 'PAGEDOWN', 'PAGEUP', 'HOME', 'VLDCMDKEY', 'SETOF', 'CHANGE', 'INDTXT'].forEach((target) => {
    const st = mount([kwd('USRDFN'), kwd('HELP', '55')]);
    const sel = kindSel();
    sel.value = target;
    sel.dispatchEvent(ev('change'));
    check('HELP -> ' + target + ': refused with the USRDFN whitelist message naming ' + target, new RegExp('^' + target + ' cannot be added to a user-defined \\(USRDFN\\) record format').test(st.alerts[0] || ''));
    check('HELP -> ' + target + ': the record is unchanged and the dropdown is back on HELP', st.changes === 0 && kindOf(st).join() === 'HELP' && kindSel().value === 'HELP');
  });
  const st = mount([kwd('USRDFN'), kwd('HELP', '55')]);
  kindSel().value = 'HLPRTN';
  kindSel().dispatchEvent(ev('change'));
  check('HELP -> HLPRTN (both on the list) is accepted', st.alerts.length === 0 && kindOf(st).join() === 'HLPRTN');
}

console.log('\nrecords that already carry a row can still be tidied (only a real kind change is checked)');
{
  const usr = mount([kwd('USRDFN'), kwd('CLEAR', '55')]);
  respBox().value = '66';
  respBox().dispatchEvent(ev('change'));
  check('USRDFN + existing CLEAR(55): editing its response indicator is accepted (no alert)', usr.alerts.length === 0 && usr.changes === 1);
  check('...and the new value is stored', usr.keywords.some((k) => k.name === 'CLEAR' && /66/.test(k.parameters)));
  const rm = document.querySelector('.repeat-inst-remove[data-prefix="rec-recind-rep"]');
  rm.dispatchEvent(ev('click'));
  check('...and the invalid row can be removed', usr.alerts.length === 0 && kindOf(usr).length === 0);

  const sfl = mount([kwd('SFL'), kwd('HOME', '55')]);
  respBox().value = '66';
  respBox().dispatchEvent(ev('change'));
  check('SFL + existing HOME(55): editing its response indicator is accepted too (the same flaw, same fix)', sfl.alerts.length === 0 && sfl.keywords.some((k) => k.name === 'HOME' && /66/.test(k.parameters)));
}

console.log('\nswitches that were already guarded still are');
{
  const sfl = mount([kwd('SFL'), kwd('CHANGE', '55')]);
  kindSel().value = 'HOME';
  kindSel().dispatchEvent(ev('change'));
  check('SFL: CHANGE -> HOME is refused (I-55)', /^HOME cannot be added to a subfile/.test(sfl.alerts[0] || '') && kindOf(sfl).join() === 'CHANGE');
  const mnu = mount([kwd('MNUBAR'), kwd('HELP', '55')]);
  kindSel().value = 'SETOF';
  kindSel().dispatchEvent(ev('change'));
  check('MNUBAR: HELP -> SETOF is refused (I-55)', /^SETOF cannot be added to a menu-bar/.test(mnu.alerts[0] || '') && kindOf(mnu).join() === 'HELP');
  const pd = mount([kwd('PULLDOWN'), kwd('HOME', '55')]);
  kindSel().value = 'CLEAR';
  kindSel().dispatchEvent(ev('change'));
  check('PULLDOWN: HOME -> CLEAR is refused (I-20)', pd.alerts.length === 1 && /^CLEAR/.test(pd.alerts[0]) && kindOf(pd).join() === 'HOME');
  const plain = mount([kwd('HELP', '55')]);
  kindSel().value = 'SETOF';
  kindSel().dispatchEvent(ev('change'));
  check('plain record: any switch is accepted', plain.alerts.length === 0 && kindOf(plain).join() === 'SETOF');
}

console.log(failures === 0 ? '\nALL CHECKS PASSED' : '\n' + failures + ' CHECK(S) FAILED');
process.exit(failures === 0 ? 0 : 1);

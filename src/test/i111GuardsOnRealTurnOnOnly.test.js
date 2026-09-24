/**
 * i111GuardsOnRealTurnOnOnly.test.js
 *
 * Task I-111 - the "the box is ticked, so it must be an addition" flaw I-84
 * fixed for RTNCSRLOC also existed in the three shared record-level guard
 * wirers, wireUsrdfnGuardedFlag, wirePulldownGuardedFlag and
 * wireUsrdfnGuardedTwoField: their USRDFN / SFL / MNUBAR / PULLDOWN checks ran
 * on every commit while the keyword was present, so on a hand-written record
 * that already carried a keyword its record type does not allow, editing the
 * keyword's parameters (or its Conditioning) was refused with "... cannot be
 * added / specified ...". Wrong for an edit, and it blocked tidying an already
 * invalid record. They now check on a real turn-on only: the keyword was NOT
 * already there.
 *
 * One block per function. Each covers: editing an existing keyword's
 * parameter / box / Conditioning is accepted (no alert, one change, still
 * exactly one keyword, value stored); removing it is accepted; and turning it
 * on is STILL refused (alert naming the record type, box/inputs reverted,
 * nothing added), with a plain record as the control.
 * Run with: node src/test/i111GuardsOnRealTurnOnOnly.test.js
 */
const path = require('path');
const { JSDOM } = require('jsdom');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));

const { check, failureCount } = require('./helpers/harness');

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>');
global.document = dom.window.document;
global.Node = dom.window.Node;
global.window = dom.window;
global.DspfWriter = DspfWriter;
const Helpers = require(path.join(__dirname, '../webviewClientHelpers.js'));
const ev = (n) => new dom.window.Event(n, { bubbles: true });
const kwd = (name, parameters) => ({ name, parameters: parameters || '', conditions: [], raw: '', sourceLines: [] });
const PANELS = ['general', 'indicatorKeywords', 'help', 'output', 'input', 'overlay', 'print'];
const FILE_KEYWORDS = [kwd('DSPSIZ', '24 80 *DS3 27 132 *DS4')]; // DSPMOD needs a two-size file

function mount(keywords) {
  const st = { keywords, changes: 0, alerts: [] };
  const expanded = new Set();
  const root = document.getElementById('root');
  function render() {
    const panels = Helpers.recordKeywordsPanelsHtml(st.keywords, 'rec', expanded);
    root.innerHTML = PANELS.map((k) => '<div data-panel="' + k + '">' + panels[k] + '</div>').join('');
    Helpers.wireRecordKeywordsPanels('rec', () => st.keywords, (next) => { st.keywords = next; st.changes++; render(); }, expanded, render, () => FILE_KEYWORDS);
  }
  window.alert = (m) => st.alerts.push(String(m));
  render();
  return st;
}
const $ = (id) => document.getElementById(id);
const count = (st, n) => st.keywords.filter((k) => k.name === n).length;
const param = (st, n) => (st.keywords.find((k) => k.name === n) || {}).parameters;
const setValue = (id, v) => { const el = $(id); el.value = v; el.dispatchEvent(ev('change')); };
const tick = (id, on) => { const el = $(id); el.checked = on; el.dispatchEvent(ev('change')); };
/** Adds an indicator condition through the row's real Conditioning UI. */
function addCondition(flagId, indicator) {
  const toggle = document.querySelector('.kw-cond-toggle[data-flag-id="' + flagId + '"]');
  if (!toggle) return false;
  toggle.dispatchEvent(ev('click'));
  const addGroup = document.querySelector('.cond-add-group[data-prefix="' + flagId + '-cond"]');
  if (!addGroup) return false;
  addGroup.dispatchEvent(ev('click'));
  const num = document.querySelector('.cond-group[data-group="pending"] .cond-ind-num');
  if (!num) return false;
  num.value = indicator;
  document.querySelector('.cond-ind-add[data-prefix="' + flagId + '-cond"][data-group="pending"]').dispatchEvent(ev('click'));
  return true;
}

// ===========================================================================
console.log('wireUsrdfnGuardedFlag (DSPMOD with a parameter box; RETKEY with Conditioning)');
{
  let st = mount([kwd('USRDFN'), kwd('DSPMOD', '*DS4')]);
  setValue('rec-dspmod-params', '*DS3');
  check('USRDFN + existing DSPMOD: editing its parameter is accepted (no alert)', st.alerts.length === 0 && st.changes === 1);
  check('...the new value is stored, still exactly one DSPMOD, record type kept', param(st, 'DSPMOD') === '*DS3' && count(st, 'DSPMOD') === 1 && count(st, 'USRDFN') === 1);

  st = mount([kwd('SFL'), kwd('DSPMOD', '*DS4')]);
  setValue('rec-dspmod-params', '*DS3');
  check('SFL + existing DSPMOD: editing its parameter is accepted too', st.alerts.length === 0 && param(st, 'DSPMOD') === '*DS3');

  st = mount([kwd('USRDFN'), kwd('DSPMOD', '*DS4')]);
  tick('rec-dspmod-on', false);
  check('USRDFN + existing DSPMOD: un-ticking removes it (no alert)', st.alerts.length === 0 && count(st, 'DSPMOD') === 0 && count(st, 'USRDFN') === 1);

  st = mount([kwd('USRDFN')]);
  tick('rec-dspmod-on', true);
  check('turning DSPMOD ON for a USRDFN record is still refused', /^DSPMOD cannot be specified on a user-defined \(USRDFN\) record/.test(st.alerts[0] || ''));
  check('...the box reverts and nothing is added', st.changes === 0 && count(st, 'DSPMOD') === 0 && $('rec-dspmod-on').checked === false);
  st = mount([kwd('SFL')]);
  tick('rec-dspmod-on', true);
  check('turning DSPMOD ON for an SFL record is still refused', st.alerts.length === 1 && st.changes === 0 && count(st, 'DSPMOD') === 0);

  st = mount([kwd('USRDFN'), kwd('RETKEY')]);
  check('USRDFN + existing RETKEY: the Conditioning UI is reachable', addCondition('rec-retkey', '21'));
  check('...adding a condition is accepted (no alert) and stored', st.alerts.length === 0 && st.keywords.some((k) => k.name === 'RETKEY' && k.conditions.length === 1));
  st = mount([kwd('USRDFN')]);
  tick('rec-retkey-on', true);
  check('turning RETKEY ON for a USRDFN record is still refused', st.alerts.length === 1 && count(st, 'RETKEY') === 0);

  st = mount([kwd('DSPMOD', '*DS4')]);
  setValue('rec-dspmod-params', '*DS3');
  check('control - a plain record edits and turns on normally', st.alerts.length === 0 && param(st, 'DSPMOD') === '*DS3');
  st = mount([]);
  tick('rec-dspmod-on', true);
  check('control - a plain record turns DSPMOD on', st.alerts.length === 0 && count(st, 'DSPMOD') === 1);
}

// ===========================================================================
console.log('\nwirePulldownGuardedFlag (SLNO / MDTOFF with a parameter box; ALARM with Conditioning)');
{
  let st = mount([kwd('USRDFN'), kwd('SLNO', '3')]);
  setValue('rec-slno-params', '4');
  check('USRDFN + existing SLNO(3): editing its parameter is accepted (no alert)', st.alerts.length === 0 && st.changes === 1);
  check('...stored as 4, still exactly one SLNO', param(st, 'SLNO') === '4' && count(st, 'SLNO') === 1);

  st = mount([kwd('SFL'), kwd('MDTOFF', '1')]);
  setValue('rec-mdtoff-params', '2');
  check('SFL + existing MDTOFF(1): editing its parameter is accepted (no "cannot be added" alert)', st.alerts.length === 0 && param(st, 'MDTOFF') === '2');

  st = mount([kwd('PULLDOWN'), kwd('SLNO', '3')]);
  setValue('rec-slno-params', '4');
  check('PULLDOWN + existing SLNO(3): editing its parameter is accepted (PULLDOWN\'s own list)', st.alerts.length === 0 && param(st, 'SLNO') === '4');

  st = mount([kwd('MNUBAR'), kwd('MDTOFF', '1')]);
  setValue('rec-mdtoff-params', '2');
  check('MNUBAR + existing MDTOFF(1): editing its parameter is accepted', st.alerts.length === 0 && param(st, 'MDTOFF') === '2');

  st = mount([kwd('SFL'), kwd('MDTOFF', '1')]);
  tick('rec-mdtoff-on', false);
  check('SFL + existing MDTOFF: un-ticking removes it, record type kept', st.alerts.length === 0 && count(st, 'MDTOFF') === 0 && count(st, 'SFL') === 1);

  st = mount([kwd('USRDFN'), kwd('ALARM')]);
  check('USRDFN + existing ALARM: the Conditioning UI is reachable', addCondition('rec-alarm', '22'));
  check('...adding a condition is accepted (no alert) and stored', st.alerts.length === 0 && st.keywords.some((k) => k.name === 'ALARM' && k.conditions.length === 1));

  st = mount([kwd('USRDFN')]);
  tick('rec-slno-on', true);
  check('turning SLNO ON for a USRDFN record is still refused', /^SLNO cannot be specified on a user-defined \(USRDFN\) record/.test(st.alerts[0] || '') && st.changes === 0 && $('rec-slno-on').checked === false);
  st = mount([kwd('SFL')]);
  tick('rec-mdtoff-on', true);
  check('turning MDTOFF ON for an SFL record is still refused (subfile wording)', /^MDTOFF cannot be added to a subfile \(SFL\) record format/.test(st.alerts[0] || '') && count(st, 'MDTOFF') === 0);
  st = mount([kwd('PULLDOWN')]);
  tick('rec-inzrcd-on', true);
  check('turning INZRCD ON for a PULLDOWN record is still refused', st.alerts.length === 1 && count(st, 'INZRCD') === 0);

  st = mount([kwd('SLNO', '3')]);
  setValue('rec-slno-params', '4');
  check('control - a plain record edits its SLNO normally', st.alerts.length === 0 && param(st, 'SLNO') === '4');
}

// ===========================================================================
console.log('\nwireUsrdfnGuardedTwoField (HLPSEQ group/number; CSRLOC row/column with Conditioning)');
{
  let st = mount([kwd('USRDFN'), kwd('HLPSEQ', 'G1 1')]);
  setValue('rec-hlpseq-num', '2');
  check('USRDFN + existing HLPSEQ: editing its number is accepted (no alert)', st.alerts.length === 0 && st.changes === 1);
  check('...stored as "G1 2", still exactly one HLPSEQ', param(st, 'HLPSEQ') === 'G1 2' && count(st, 'HLPSEQ') === 1);
  setValue('rec-hlpseq-group', 'G2');
  check('...and editing its group too', st.alerts.length === 0 && param(st, 'HLPSEQ') === 'G2 2');

  st = mount([kwd('MNUBAR'), kwd('HLPSEQ', 'G1 1')]);
  setValue('rec-hlpseq-num', '2');
  check('MNUBAR + existing HLPSEQ: editing is accepted (no "cannot be added" alert)', st.alerts.length === 0 && param(st, 'HLPSEQ') === 'G1 2');

  st = mount([kwd('USRDFN'), kwd('CSRLOC', '5 10')]);
  setValue('rec-csrloc-col', '11');
  check('USRDFN + existing CSRLOC: editing its column is accepted', st.alerts.length === 0 && param(st, 'CSRLOC') === '5 11');
  st = mount([kwd('USRDFN'), kwd('CSRLOC', '5 10')]);
  check('...its Conditioning UI is reachable', addCondition('rec-csrloc', '23'));
  check('...adding a condition is accepted (no alert) and stored', st.alerts.length === 0 && st.keywords.some((k) => k.name === 'CSRLOC' && k.conditions.length === 1));

  st = mount([kwd('USRDFN'), kwd('HLPSEQ', 'G1 1')]);
  $('rec-hlpseq-num').value = '';
  setValue('rec-hlpseq-group', ''); // both boxes blank when the change fires
  check('blanking both boxes removes an existing HLPSEQ (no alert), record type kept', st.alerts.length === 0 && count(st, 'HLPSEQ') === 0 && count(st, 'USRDFN') === 1);

  st = mount([kwd('USRDFN')]);
  setValue('rec-hlpseq-group', 'G1');
  check('typing an HLPSEQ group into a USRDFN record is still refused', /^HLPSEQ cannot be specified on a user-defined \(USRDFN\) record/.test(st.alerts[0] || ''));
  check('...the box reverts and nothing is added', st.changes === 0 && count(st, 'HLPSEQ') === 0 && $('rec-hlpseq-group').value === '');
  st = mount([kwd('MNUBAR')]);
  setValue('rec-hlpseq-num', '1');
  check('typing an HLPSEQ number into a MNUBAR record is still refused (menu-bar wording)', /^HLPSEQ cannot be added to a menu-bar \(MNUBAR\) record format/.test(st.alerts[0] || '') && count(st, 'HLPSEQ') === 0);
  st = mount([kwd('USRDFN')]);
  setValue('rec-csrloc-row', '5');
  check('typing a CSRLOC row into a USRDFN record is still refused', st.alerts.length === 1 && count(st, 'CSRLOC') === 0);

  st = mount([kwd('HLPSEQ', 'G1 1')]);
  setValue('rec-hlpseq-num', '2');
  check('control - a plain record edits its HLPSEQ normally', st.alerts.length === 0 && param(st, 'HLPSEQ') === 'G1 2');
  st = mount([]);
  setValue('rec-hlpseq-group', 'G1');
  check('control - a plain record adds one', st.alerts.length === 0 && count(st, 'HLPSEQ') === 1);
}

console.log(failureCount() === 0 ? '\nALL CHECKS PASSED' : '\n' + failureCount() + ' CHECK(S) FAILED');
process.exit(failureCount() === 0 ? 0 : 1);

/**
 * i110HlptitleMnubardspAddGuard.test.js
 *
 * Task I-110 - record-level "+ Add" for HLPTITLE (USRDFN, SFL records) and
 * MNUBARDSP (USRDFN record) was accepted although neither keyword is on that
 * record type's closed whitelist (found by the I-104 sweep, finding E). MOUBTN's
 * "+ Add" (I-42) is the model: alert with the whitelist reason, add nothing.
 *
 * The I-104 sweep now covers the accept/refuse matrix; this file pins the
 * specifics: the message, that nothing is added, that a record which ALREADY
 * carries the keyword can still be edited / tidied (the guard is on the Add
 * click only), that the neighbouring guards (MNUBARDSP on SFL, MOUBTN) are
 * unchanged, and that MNUBAR and plain records still add.
 * Run with: node src/test/i110HlptitleMnubardspAddGuard.test.js
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
const count = (st, name) => st.keywords.filter((k) => k.name === name).length;
const addBtn = (id) => document.querySelector('[data-prefix="' + id + '"].repeat-inst-add, #' + id + '-add, button[data-add="' + id + '"]') ||
  Array.from(document.querySelectorAll('button')).find((b) => (b.getAttribute('data-prefix') === id || b.id === id + '-add') && /Add/.test(b.textContent));
function clickAdd(id) {
  const b = addBtn(id);
  if (!b) return false;
  b.dispatchEvent(ev('click'));
  return true;
}

console.log('HLPTITLE "+ Add" on a USRDFN record');
{
  const st = mount([kwd('USRDFN')]);
  check('the Add button exists (reachable)', clickAdd('rec-hlptitle-rep'));
  check('refused with an alert', st.alerts.length === 1);
  check('...that names HLPTITLE and the USRDFN record format', /^HLPTITLE cannot be added to a user-defined \(USRDFN\) record format/.test(st.alerts[0] || ''));
  check('...and lists what is allowed (per the DDS Reference)', /INVITE, KEEP, PASSRCD, HLPRTN, HELP, HLPCLR, PRINT, OPENPRT, and TEXT/.test(st.alerts[0] || ''));
  check('nothing was added and the record was not re-rendered as changed', count(st, 'HLPTITLE') === 0 && st.changes === 0);
}

console.log('\nHLPTITLE "+ Add" on an SFL record');
{
  const st = mount([kwd('SFL')]);
  clickAdd('rec-hlptitle-rep');
  check('refused with an alert naming the subfile record format', /^HLPTITLE cannot be added to a subfile \(SFL\) record format/.test(st.alerts[0] || ''));
  check('nothing was added', count(st, 'HLPTITLE') === 0 && st.changes === 0);
}

console.log('\nMNUBARDSP "+ Add" on a USRDFN record');
{
  const st = mount([kwd('USRDFN')]);
  check('the Add button exists (reachable)', clickAdd('rec-mnubardsp-rep'));
  check('refused with an alert naming MNUBARDSP and the USRDFN record format', /^MNUBARDSP cannot be added to a user-defined \(USRDFN\) record format/.test(st.alerts[0] || ''));
  check('nothing was added', count(st, 'MNUBARDSP') === 0 && st.changes === 0);
}

console.log('\nneighbouring guards are unchanged');
{
  const sfl = mount([kwd('SFL')]);
  clickAdd('rec-mnubardsp-rep');
  check('MNUBARDSP on SFL is still refused (I-55)', /^MNUBARDSP cannot be added to a subfile/.test(sfl.alerts[0] || '') && count(sfl, 'MNUBARDSP') === 0);
  const usr = mount([kwd('USRDFN')]);
  clickAdd('rec-moubtn-rep');
  check('MOUBTN on USRDFN is still refused (I-42)', /^MOUBTN cannot be added to a user-defined/.test(usr.alerts[0] || '') && count(usr, 'MOUBTN') === 0);
}

console.log('\nallowed record types still add');
{
  const mb = mount([kwd('MNUBAR')]);
  clickAdd('rec-hlptitle-rep');
  check('HLPTITLE on a MNUBAR record is accepted', mb.alerts.length === 0 && count(mb, 'HLPTITLE') === 1);
  const mb2 = mount([kwd('MNUBAR')]);
  clickAdd('rec-mnubardsp-rep');
  check('MNUBARDSP on a MNUBAR record is accepted', mb2.alerts.length === 0 && count(mb2, 'MNUBARDSP') === 1);
  const plain = mount([]);
  clickAdd('rec-hlptitle-rep');
  clickAdd('rec-mnubardsp-rep');
  check('both are accepted on a plain record', plain.alerts.length === 0 && count(plain, 'HLPTITLE') === 1 && count(plain, 'MNUBARDSP') === 1);
  clickAdd('rec-hlptitle-rep');
  check('a plain record can add a second HLPTITLE (conditioned pair) - the guard never blocks it', plain.alerts.length === 0 && count(plain, 'HLPTITLE') === 2);
}

console.log('\nan already-invalid record can still be tidied (the guard is on "+ Add" only)');
{
  const st = mount([kwd('USRDFN'), kwd('HLPTITLE', "'Old title'"), kwd('MNUBARDSP', '')]);
  const textEl = document.querySelector('.rec-hlptitle-rep-0-text, input[class*="rec-hlptitle-rep"][class$="-text"]');
  check('the existing HLPTITLE row is rendered with its text box', !!textEl);
  if (textEl) {
    textEl.value = 'New title';
    textEl.dispatchEvent(ev('change'));
    check('editing its text is accepted (no alert)', st.alerts.length === 0 && st.changes === 1);
    check('...and the new text is stored', st.keywords.find((k) => k.name === 'HLPTITLE').parameters === "'New title'");
  }
  const rm = document.querySelector('.repeat-inst-remove[data-prefix="rec-hlptitle-rep"]');
  check('the row can be removed', !!rm);
  if (rm) {
    rm.dispatchEvent(ev('click'));
    check('removing works (no alert) and the keyword is gone', st.alerts.length === 0 && count(st, 'HLPTITLE') === 0);
  }
}

console.log(failureCount() === 0 ? '\nALL CHECKS PASSED' : '\n' + failureCount() + ' CHECK(S) FAILED');
process.exit(failureCount() === 0 ? 0 : 1);

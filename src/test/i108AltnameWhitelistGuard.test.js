/**
 * i108AltnameWhitelistGuard.test.js
 *
 * Task I-108 (raised by I-104 finding C, docs/sda-reference/keywordFixes.md) -
 * the record-level ALTNAME text row (General tab) committed without any
 * USRDFN/SFL/MNUBAR whitelist check - only PULLDOWN (I-13) was ever guarded.
 * IBM's own DDS Reference puts ALTNAME on none of the three ("ALTNAME is not
 * allowed on subfile records (SFL keyword)" is explicit; USRDFN's and
 * MNUBAR's own closed keyword lists simply omit it).
 *
 * Same lightweight harness as i111GuardsOnRealTurnOnOnly.test.js - mounts
 * recordKeywordsPanelsHtml/wireRecordKeywordsPanels directly rather than the
 * full webviewTemplate, so this is a real generated-and-wired ALTNAME row,
 * not a call to the dspfWriter.js primitives in isolation.
 *
 * Covers: refused (alert naming ALTNAME, box reverted, nothing added) on a
 * USRDFN, SFL and MNUBAR record; accepted on a plain record (the control)
 * and still refused on a PULLDOWN record (I-13's pre-existing guard, not
 * regressed by adding the other three); and, per I-111's "real turn-on
 * only" rule (landed after this guard's first draft, applied here too):
 * editing an already-present ALTNAME's text on a hand-written invalid
 * USRDFN record is accepted, not blocked as an addition, and removing it
 * (blanking the box) is always accepted, on every record type.
 * Run with: node src/test/i108AltnameWhitelistGuard.test.js
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
const $ = (id) => document.getElementById(id);
const has = (st, n) => st.keywords.some((k) => k.name === n);
const param = (st, n) => (st.keywords.find((k) => k.name === n) || {}).parameters;
const setValue = (id, v) => { const el = $(id); el.value = v; el.dispatchEvent(ev('change')); };

// ===========================================================================
console.log('ALTNAME on a plain record (the control): accepted');
{
  const st = mount([]);
  setValue('rec-altname', 'ALT1');
  check('no alert', st.alerts.length === 0);
  check('one change committed', st.changes === 1);
  check('ALTNAME landed with the typed text', has(st, 'ALTNAME') && /ALT1/.test(param(st, 'ALTNAME')));
}

console.log('\nALTNAME on a USRDFN record: refused');
{
  const st = mount([kwd('USRDFN')]);
  setValue('rec-altname', 'ALT1');
  check('refused with an alert', st.alerts.length === 1);
  check('the alert names ALTNAME', /^ALTNAME\b/.test(st.alerts[0] || ''));
  check('nothing was committed', st.changes === 0);
  check('the record is untouched', !has(st, 'ALTNAME'));
  check('the box reverted to blank', $('rec-altname').value === '');
}

console.log('\nALTNAME on an SFL record: refused (DDS Reference states this one explicitly)');
{
  const st = mount([kwd('SFL')]);
  setValue('rec-altname', 'ALT1');
  check('refused with an alert', st.alerts.length === 1);
  check('the alert names ALTNAME', /^ALTNAME\b/.test(st.alerts[0] || ''));
  check('nothing was committed', st.changes === 0);
  check('the box reverted to blank', $('rec-altname').value === '');
}

console.log('\nALTNAME on a MNUBAR record: refused');
{
  const st = mount([kwd('MNUBAR')]);
  setValue('rec-altname', 'ALT1');
  check('refused with an alert', st.alerts.length === 1);
  check('the alert names ALTNAME', /^ALTNAME\b/.test(st.alerts[0] || ''));
  check('nothing was committed', st.changes === 0);
  check('the box reverted to blank', $('rec-altname').value === '');
}

console.log('\nALTNAME on a PULLDOWN record: still refused (I-13\'s pre-existing guard, not regressed)');
{
  const st = mount([kwd('PULLDOWN')]);
  setValue('rec-altname', 'ALT1');
  check('refused with an alert', st.alerts.length === 1);
  check('the alert names ALTNAME', /^ALTNAME\b/.test(st.alerts[0] || ''));
  check('nothing was committed', st.changes === 0);
}

console.log('\nI-111\'s "real turn-on only" rule applies here too:');
{
  console.log('  editing an already-present ALTNAME\'s text on a hand-written (invalid) USRDFN record is accepted, not blocked as an addition');
  const st = mount([kwd('USRDFN'), kwd('ALTNAME', "'OLD'")]);
  setValue('rec-altname', "'NEW'");
  check('no alert (this is an edit, not an addition)', st.alerts.length === 0);
  check('one change committed', st.changes === 1);
  check('the record still carries exactly one ALTNAME', st.keywords.filter((k) => k.name === 'ALTNAME').length === 1);
  check('with the new text', /NEW/.test(param(st, 'ALTNAME')));
}
{
  console.log('  removing an already-present ALTNAME (blanking the box) is accepted on a USRDFN record');
  const st = mount([kwd('USRDFN'), kwd('ALTNAME', "'OLD'")]);
  setValue('rec-altname', '');
  check('no alert', st.alerts.length === 0);
  check('one change committed', st.changes === 1);
  check('ALTNAME was removed', !has(st, 'ALTNAME'));
}
{
  console.log('  removing an already-present ALTNAME is accepted on an SFL record too');
  const st = mount([kwd('SFL'), kwd('ALTNAME', "'OLD'")]);
  setValue('rec-altname', '');
  check('no alert', st.alerts.length === 0);
  check('ALTNAME was removed', !has(st, 'ALTNAME'));
}
{
  console.log('  turning ALTNAME on fresh is STILL refused on that same USRDFN record (only the pre-existing instance is exempt)');
  const st = mount([kwd('USRDFN')]);
  setValue('rec-altname', 'FRESH');
  check('refused with an alert', st.alerts.length === 1);
  check('nothing was committed', st.changes === 0);
}

console.log(failures === 0 ? '\nALL CHECKS PASSED' : '\n' + failures + ' CHECK(S) FAILED');
process.exitCode = failures === 0 ? 0 : 1;

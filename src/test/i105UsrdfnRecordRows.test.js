/**
 * i105UsrdfnRecordRows.test.js
 *
 * Task I-105 (docs/sda-reference/keywordFixes.md) - a USRDFN record used to
 * present "this keyword does not apply" two different ways: R2 hid 28 rows by
 * dropping whole panels, while 13 non-whitelisted rows stayed shown AND enabled
 * (refused on tick) and the whitelisted INVITE was hidden with its panel.
 * Decision (Warrior): option (a) - hide every non-applicable row on a USRDFN
 * record, and show every applicable one.
 *
 * Mounts recordKeywordsPanelsHtml(..., restrictTo) / wireRecordKeywordsPanels
 * directly (same lightweight harness as i108/i111). The real-template side (the
 * subtabs a USRDFN record gets) is covered by dspfWebview.test.js's R2 scenario.
 * Run with: node src/test/i105UsrdfnRecordRows.test.js
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
const $ = (id) => document.getElementById(id);

/** Every element id a panel set renders (rows + their params/conditioning). */
function idsOf(panels) {
  const holder = new dom.window.DOMParser().parseFromString('<body>' + PANELS.map((k) => panels[k]).join('') + '</body>', 'text/html');
  return Array.from(holder.querySelectorAll('[id]')).map((e) => e.id);
}

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
const has = (st, n) => st.keywords.some((k) => k.name === n);

const USRDFN = [kwd('USRDFN')];
const fullIds = idsOf(Helpers.recordKeywordsPanelsHtml(USRDFN, 'rec', new Set()));
const usrIds = idsOf(Helpers.recordKeywordsPanelsHtml(USRDFN, 'rec', new Set(), 'USRDFN'));

// ===========================================================================
console.log('USRDFN view renders only the whitelisted rows');
{
  for (const stem of ['keep', 'invite', 'text', 'hlpclr', 'print']) {
    check(stem + ' row is rendered', usrIds.some((i) => i === 'rec-' + stem || i === 'rec-' + stem + '-on'));
  }
  check('print file / library boxes are rendered', usrIds.includes('rec-print-file') && usrIds.includes('rec-print-library'));
  const NOT_APPLICABLE = ['inzrcd', 'assume', 'alwrol', 'retkey', 'retcmdkey', 'csrinponly', 'chginpdft', 'valnum', 'wrdwrap',
    'entfldatr', 'rtncsrloc-rn-on', 'rtncsrloc-wm-on', 'altname', 'hlpcmdkey', 'hlpseq-group', 'blink', 'alarm', 'lock', 'logout',
    'alwgph', 'frcdta', 'dspmod', 'csrloc-row', 'slno', 'clrl', 'loginp', 'unlock', 'getretain', 'retlcksts', 'check-ab', 'check-rl',
    'rtndta', 'overlay', 'putretain', 'protect', 'putovr', 'ovrdta', 'ovratr', 'inzinp', 'mdtoff', 'eraseinp', 'erase', 'msgalarm'];
  const shown = NOT_APPLICABLE.filter((s) => usrIds.some((i) => i === 'rec-' + s || i === 'rec-' + s + '-on'));
  check('none of the ' + NOT_APPLICABLE.length + ' non-applicable rows is rendered (shown: ' + (shown.join(',') || 'none') + ')', shown.length === 0);
  check('no MNUBARDSP / HLPTITLE / MOUBTN instance lists are rendered',
    !usrIds.some((i) => /mnubardsp|hlptitle|moubtn/i.test(i)));
  // Task I-114: the record-indicator list IS rendered now (HELP / HLPRTN only - see i114UsrdfnIndicatorSubtab.test.js).
  check('the record-indicator list is rendered (I-114), limited to HELP / HLPRTN by the kind selector',
    usrIds.some((i) => /recind/i.test(i)));
  check('the default (non-USRDFN-view) panels still render the full row set', fullIds.length > usrIds.length + 30);
  check('every id the USRDFN view renders is one the full view also renders (same wiring ids)', usrIds.every((i) => fullIds.includes(i)));
  const panels = Helpers.recordKeywordsPanelsHtml(USRDFN, 'rec', new Set(), 'USRDFN');
  check('the panels R2 still drops come back empty, not undefined (the Indicator panel is no longer one of them - I-114)',
    ['output', 'input', 'overlay'].every((k) => panels[k] === '') && panels.indicatorKeywords !== '');
}

// ===========================================================================
console.log('Every applicable row commits on a USRDFN record (INVITE was unreachable before)');
{
  for (const stem of ['keep', 'invite', 'hlpclr', 'print']) {
    const st = mount(USRDFN.slice(), 'USRDFN');
    const cb = $('rec-' + stem + '-on');
    cb.checked = true;
    cb.dispatchEvent(ev('change'));
    check(stem.toUpperCase() + ': accepted, no alert', st.alerts.length === 0 && has(st, stem.toUpperCase()));
    check(stem.toUpperCase() + ': USRDFN itself untouched', has(st, 'USRDFN'));
  }
  const st = mount(USRDFN.slice(), 'USRDFN');
  $('rec-text').value = 'user defined format';
  $('rec-text').dispatchEvent(ev('change'));
  check('TEXT: accepted', st.alerts.length === 0 && has(st, 'TEXT'));
  const st2 = mount(USRDFN.concat([kwd('INVITE')]), 'USRDFN');
  check('a present INVITE renders ticked', $('rec-invite-on').checked === true);
  $('rec-invite-on').checked = false;
  $('rec-invite-on').dispatchEvent(ev('change'));
  check('and can be un-ticked', !has(st2, 'INVITE') && st2.alerts.length === 0);
}

// ===========================================================================
console.log('A hand-written non-applicable keyword: hidden in the panel, still visible/removable in the raw editor (I-49)');
{
  const kws = USRDFN.concat([kwd('INZRCD')]);
  const st = mount(kws, 'USRDFN');
  check('no INZRCD row in the panels', !$('rec-inzrcd-on'));
  const raw = Helpers.keywordEditorHtml(kws, 'record-X', new Set());
  check('the raw editor still lists INZRCD, so it can be removed there', /INZRCD/.test(raw));
  check('the panel render did not alter the keywords', st.keywords.length === 2 && has(st, 'INZRCD'));
}

// ===========================================================================
// SFL and MNUBAR follow the same rule (Warrior: "sfl/menu do it now").
const ROWS = {
  SFL: { keep: ['keep', 'chginpdft', 'text'], out: ['logout'], inp: ['loginp', 'check-ab', 'check-rl'], kinds: ['CHANGE', 'SETOF', 'INDTXT'] },
  MNUBAR: { keep: ['keep', 'text', 'mnubardsp', 'hlpclr', 'hlpcmdkey', 'hlptitle', 'overlay', 'protect', 'print'], out: ['lock', 'invite', 'dspmod', 'csrloc', 'clrl'], inp: ['unlock'], kinds: ['CLEAR', 'HOME', 'PAGEDOWN', 'PAGEUP', 'HELP', 'HLPRTN', 'VLDCMDKEY', 'INDTXT'] },
};
const rowIn = (ids, stem) => ids.some((i) => i === 'rec-' + stem || i === 'rec-' + stem + '-on' || i.indexOf('rec-' + stem + '-') === 0);
for (const type of ['SFL', 'MNUBAR']) {
  console.log(type + ' record: only whitelisted rows are rendered');
  const base = [kwd(type)];
  const full = idsOf(Helpers.recordKeywordsPanelsHtml(base, 'rec', new Set()));
  const only = idsOf(Helpers.recordKeywordsPanelsHtml(base, 'rec', new Set(), type));
  const exp = ROWS[type];
  check(type + ': applicable rows present (' + exp.keep.concat(exp.out, exp.inp).join(',') + ')',
    exp.keep.concat(exp.out, exp.inp).every((s) => rowIn(only, s)));
  const NOT = ['inzrcd', 'assume', 'alwrol', 'retkey', 'entfldatr', 'valnum', 'wrdwrap', 'altname', 'blink', 'alarm', 'unlock', 'logout', 'loginp',
    'lock', 'invite', 'overlay', 'protect', 'print', 'erase', 'hlpseq-group', 'moubtn', 'rtncsrloc-rn-on', 'getretain', 'rtndta', 'check-ab', 'hlpclr', 'hlpcmdkey', 'dspmod', 'clrl', 'slno', 'text', 'keep', 'chginpdft', 'mnubardsp']
    .filter((s) => exp.keep.concat(exp.out, exp.inp).indexOf(s) < 0);
  const shown = NOT.filter((s) => rowIn(only, s));
  check(type + ': non-applicable rows are not rendered (shown: ' + (shown.join(',') || 'none') + ')', shown.length === 0);
  check(type + ': the restricted view renders fewer rows than the full one', only.length < full.length);

  const panels = Helpers.recordKeywordsPanelsHtml(base, 'rec', new Set(), type);
  // The kind selector only exists once an instance does; add one to look at it.
  const withInst = Helpers.recordKeywordsPanelsHtml(base.concat([kwd('INDTXT', '10 \'x\'')]), 'rec', new Set(), type);
  const d3 = new dom.window.DOMParser().parseFromString('<body>' + withInst.indicatorKeywords + '</body>', 'text/html');
  const kinds = Array.from(d3.querySelectorAll('select option')).map((o) => o.value).sort();
  check(type + ': the indicator kind selector lists exactly the allowed kinds (' + kinds.join(',') + ')',
    JSON.stringify(kinds) === JSON.stringify(exp.kinds.slice().sort()));
  check(type + ': every panel that has no applicable row is an empty string, not undefined', PANELS.every((k) => typeof panels[k] === 'string'));

  // commit an applicable row, on the wired panels
  const st = mount(base.slice(), type);
  const stem = exp.keep[0];
  $('rec-' + stem + '-on').checked = true;
  $('rec-' + stem + '-on').dispatchEvent(ev('change'));
  check(type + ': ' + stem.toUpperCase() + ' commits, no alert', st.alerts.length === 0 && has(st, stem.toUpperCase()) && has(st, type));
  const st2 = mount(base.concat([kwd('INZRCD')]), type);
  check(type + ': a hand-written INZRCD is hidden in the panel but kept', !$('rec-inzrcd-on') && has(st2, 'INZRCD'));
  check(type + ': ...and still listed in the raw editor', /INZRCD/.test(Helpers.keywordEditorHtml(base.concat([kwd('INZRCD')]), 'record-X', new Set())));
}
console.log('SFLCTL records are not restricted here (SFLMSG was added by I-115 - see i115SflmsgKeywordsTab.test.js)');
{
  check('recordKeywordsRestriction: USRDFN / SFL / MNUBAR / plain / SFLMSG / SFLCTL',
    Helpers.recordKeywordsRestriction({ keywords: [kwd('USRDFN')] }) === 'USRDFN' &&
    Helpers.recordKeywordsRestriction({ keywords: [kwd('SFL')] }) === 'SFL' &&
    Helpers.recordKeywordsRestriction({ keywords: [kwd('MNUBAR')] }) === 'MNUBAR' &&
    Helpers.recordKeywordsRestriction({ keywords: [] }) === null &&
    Helpers.recordKeywordsRestriction({ keywords: [kwd('SFL'), kwd('SFLMSGRCD')] }) === 'SFLMSG' &&
    Helpers.recordKeywordsRestriction({ keywords: [kwd('SFLCTL')] }) === null);
}

// ===========================================================================
console.log('Other record types are unaffected (default view keeps every row)');
{
  const st = mount([], undefined);
  check('a plain record still has INZRCD, INVITE, ALTNAME, MNUBARDSP rows', !!$('rec-inzrcd-on') && !!$('rec-invite-on') && !!$('rec-altname'));
  const stSfl = mount([kwd('SFL')], undefined);
  check('an SFL record still shows the full set', !!$('rec-inzrcd-on') && stSfl.alerts.length === 0);
  const stMnu = mount([kwd('MNUBAR')], undefined);
  check('an MNUBAR record still shows the full set', !!$('rec-inzrcd-on') && stMnu.alerts.length === 0);
}

console.log(failures === 0 ? '\nALL CHECKS PASSED' : '\n' + failures + ' CHECK(S) FAILED');
process.exit(failures === 0 ? 0 : 1);

/**
 * i129SubfileControlOnlyFieldKeywords.test.js
 *
 * Task I-129 - deferred finding from I-126/I-127. SFLSCROLL's, SFLRCDNBR's
 * and SFLROLVAL's own DDS Reference sections each say the keyword "is valid
 * only for the subfile-control record format", but the Subfile keywords
 * panel is also offered for a field in an SFL detail record and the raw
 * keyword editor takes any keyword on any field, so nothing blocked them
 * there.
 *
 * Fix: KeywordSpec `validOnlyInSubfileControlRecord` on the three keywords,
 * and a diff-based backstop DspfWriter.subfileControlOnlyFieldNewConflictReason
 * called from commitEdit (which covers the panel and the raw editor at once).
 *
 * Run with: node src/test/i129SubfileControlOnlyFieldKeywords.test.js
 */
const path = require('path');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const DspfParser = require(path.join(__dirname, '../../dist/dspfParser.js'));
const { check, failureCount } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');

const k = (name, parameters) => ({ name, parameters: parameters || '', conditions: [], raw: '', sourceLines: [] });

// ===========================================================================
console.log('\nKeywordSpec.validOnlyInSubfileControlRecord');
{
  ['SFLSCROLL', 'SFLRCDNBR', 'SFLROLVAL'].forEach((n) => {
    check(n + ' is control-record-only', KeywordSpec.validOnlyInSubfileControlRecord(n));
    const e = KeywordSpec.RECORD_TYPES[n].validOnlyInSubfileControlRecord;
    check(n + ' citation states the DDS Reference sentence', /valid only for the subfile-control record format/.test(e.ddsReference));
  });
  check('SFLCHCCTL is not (it belongs to the subfile record)', !KeywordSpec.validOnlyInSubfileControlRecord('SFLCHCCTL'));
  check('SFLCSRPRG is not', !KeywordSpec.validOnlyInSubfileControlRecord('SFLCSRPRG'));
  check('an unknown keyword is not', !KeywordSpec.validOnlyInSubfileControlRecord('NOSUCH'));
  check('undefined is not', !KeywordSpec.validOnlyInSubfileControlRecord(undefined));
  const holders = Object.keys(KeywordSpec.RECORD_TYPES).filter((n) => KeywordSpec.RECORD_TYPES[n].validOnlyInSubfileControlRecord);
  check('exactly SFLRCDNBR, SFLROLVAL, SFLSCROLL carry the fact', holders.sort().join(',') === 'SFLRCDNBR,SFLROLVAL,SFLSCROLL');
  check('SFLRCDNBR/SFLROLVAL entries carry no other rule', ['SFLRCDNBR', 'SFLROLVAL'].every((n) => {
    const e = KeywordSpec.RECORD_TYPES[n];
    return !e.mutex && !e.onePerRecord && !e.definitionRequirements && !e.notAllowedWhenEqual;
  }));
  check('SFLSCROLL keeps its own earlier facts', KeywordSpec.isMutex('SFLSCROLL', 'SFLROLVAL') && KeywordSpec.isOnePerRecord('SFLSCROLL'));
}

// ===========================================================================
console.log('\nDspfWriter.subfileControlOnlyFieldNewConflictReason');
{
  const f = DspfWriter.subfileControlOnlyFieldNewConflictReason;
  ['SFLSCROLL', 'SFLRCDNBR', 'SFLROLVAL'].forEach((n) => {
    const r = f([], [k(n)], false);
    check('introducing ' + n + ' outside a control record is blocked, naming it', typeof r === 'string' && r.indexOf(n + ' is valid only for the subfile-control record format') === 0);
    check('introducing ' + n + ' in a control record is allowed', f([], [k(n)], true) === null);
  });
  check('a parameter does not matter (SFLRCDNBR(*TOP))', f([], [k('SFLRCDNBR', '*TOP')], false) !== null);
  check('mentions SFLCTL so the fix is clear', /carries SFLCTL/.test(f([], [k('SFLSCROLL')], false)));
  check('an unrelated keyword is allowed', f([], [k('DSPATR', 'HI')], false) === null);
  check('a subfile-record keyword (SFLCHCCTL) is allowed', f([], [k('SFLCHCCTL')], false) === null);
  check('already present and unchanged is not re-reported', f([k('SFLSCROLL')], [k('SFLSCROLL')], false) === null);
  check('already-invalid field + an unrelated keyword added is not re-reported', f([k('SFLSCROLL')], [k('SFLSCROLL'), k('TEXT', "'x'")], false) === null);
  check('turning it OFF is never blocked', f([k('SFLROLVAL')], [], false) === null);
  check('a NEW second one on an already-invalid field is still blocked', f([k('SFLSCROLL')], [k('SFLSCROLL'), k('SFLROLVAL')], false) !== null);
  check('first offender in edit order is reported', /^SFLROLVAL /.test(f([], [k('SFLROLVAL'), k('SFLSCROLL')], false)));
  check('null / undefined inputs are safe', f(null, null, false) === null && f(undefined, undefined, undefined) === null && f(null, [k('SFLSCROLL')], false) !== null);
}

// ===========================================================================
console.log('\nWebview: the Subfile keywords panel and the commitEdit backstop');
const SRC = [
  '     A                                      DSPSIZ(24 80 *DS3)',
  '     A          R SFLREC                     SFL',
  "     A            HIDA           5S 0H",
  "     A            HIDB           5S 0H",
  '     A          R SFLCTLR                    SFLCTL(SFLREC)',
  '     A                                      SFLSIZ(34)',
  '     A                                      SFLPAG(17)',
  "     A            CTLH           5S 0H",
  '     A          R SFLBAD                     SFL',
  "     A            BADH           5S 0H",
  '     A                                      SFLSCROLL',
].join('\n') + '\n';
const posted = [];
const alerts = [];
const errors = [];
const dom = newWebviewDom(webviewHtml('vscode-webview://fake', 'testnonce', SRC, 'I129.DSPF'), {
  beforeParse(window) {
    window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
    window.alert = (m) => alerts.push(m);
    window.addEventListener('error', (e) => errors.push(e.error || e.message));
  },
});

function selectHiddenFieldByName(doc, Event, name) {
  const tab = Array.prototype.slice.call(doc.querySelectorAll('.props-tab')).find((b) => b.getAttribute('data-tab') === 'hidden');
  if (!tab) return false;
  tab.dispatchEvent(new Event('click', { bubbles: true }));
  const row = Array.prototype.slice.call(doc.querySelectorAll('.field-order-row[data-source-line]')).find((el) => el.textContent.indexOf(name) !== -1);
  if (!row) return false;
  row.dispatchEvent(new Event('click', { bubbles: true }));
  return true;
}

setTimeout(() => {
  const { document: doc, Event } = dom.window;
  const recordSelect = doc.getElementById('recordSelect');
  const gotoRecord = (name) => {
    const crumb = doc.getElementById('crumb-record');
    if (crumb) crumb.dispatchEvent(new Event('click', { bubbles: true }));
    recordSelect.value = name;
    recordSelect.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const byId = (suffix) => Array.prototype.slice.call(doc.querySelectorAll('input, select')).find((el) => el.id.endsWith(suffix));
  const applied = () => posted.find((m) => m.type === 'applyEdit');
  const reset = () => { posted.length = 0; alerts.length = 0; };
  const tick = (suffix) => { const el = byId(suffix); el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true })); };
  const blocked = (re) => alerts.length > 0 && re.test(alerts[alerts.length - 1]) && !applied();

  // --- SFL detail record: all three refused
  gotoRecord('SFLREC');
  check('HIDA (hidden field in the SFL record) is selectable', selectHiddenFieldByName(doc, Event, 'HIDA'));
  check('the panel is offered there, with the new hint', !!byId('-sflscroll') && /valid only on a field of the subfile control/.test(doc.body.textContent));
  reset(); tick('-sflscroll');
  check('SFLSCROLL checkbox refused in an SFL record, alert names it, no applyEdit', blocked(/^SFLSCROLL is valid only for the subfile-control record format/));
  check('  ...and the checkbox is reverted by the re-render', !byId('-sflscroll').checked);
  gotoRecord('SFLREC'); selectHiddenFieldByName(doc, Event, 'HIDA');
  reset(); tick('-sflrolval');
  check('SFLROLVAL checkbox refused in an SFL record', blocked(/^SFLROLVAL is valid only for the subfile-control record format/));
  gotoRecord('SFLREC'); selectHiddenFieldByName(doc, Event, 'HIDA');
  reset();
  { const sel = byId('-sflrcdnbr'); sel.value = 'CURSOR'; sel.dispatchEvent(new Event('change', { bubbles: true })); }
  check('SFLRCDNBR(CURSOR) refused in an SFL record', blocked(/^SFLRCDNBR is valid only for the subfile-control record format/));

  // --- SFLCTL record: allowed
  gotoRecord('SFLCTLR');
  check('CTLH (hidden field in the control record) is selectable', selectHiddenFieldByName(doc, Event, 'CTLH'));
  reset(); tick('-sflscroll');
  check('SFLSCROLL is allowed in the control record (edit posted, no alert)', !!applied() && alerts.length === 0);
  {
    const rec = applied() && DspfParser.parseDspf(applied().text).records.find((r) => r.name === 'SFLCTLR');
    const fld = rec && rec.fields.find((x) => x.name === 'CTLH');
    check('  ...SFLSCROLL written on CTLH', !!fld && fld.keywords.some((x) => x.name === 'SFLSCROLL'));
  }
  gotoRecord('SFLCTLR'); selectHiddenFieldByName(doc, Event, 'CTLH');
  reset(); tick('-sflrolval');
  check('SFLROLVAL is allowed in the control record', !!applied() && alerts.length === 0);

  // --- hand-written already-invalid SFL record: turning it OFF is not blocked
  gotoRecord('SFLBAD');
  check('BADH (hand-written SFLSCROLL in an SFL record) is selectable', selectHiddenFieldByName(doc, Event, 'BADH'));
  check('its SFLSCROLL box shows checked', !!byId('-sflscroll') && byId('-sflscroll').checked);
  reset();
  { const el = byId('-sflscroll'); el.checked = false; el.dispatchEvent(new Event('change', { bubbles: true })); }
  check('turning the wrong-record SFLSCROLL OFF is allowed (edit posted, no alert)', !!applied() && alerts.length === 0);
  {
    const rec = applied() && DspfParser.parseDspf(applied().text).records.find((r) => r.name === 'SFLBAD');
    const fld = rec && rec.fields.find((x) => x.name === 'BADH');
    check('  ...SFLSCROLL removed from BADH', !!fld && !fld.keywords.some((x) => x.name === 'SFLSCROLL'));
  }

  check('no uncaught errors', errors.length === 0);
  console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : failureCount() + ' CHECK(S) FAILED'));
  process.exit(failureCount() === 0 ? 0 : 1);
}, 1500);

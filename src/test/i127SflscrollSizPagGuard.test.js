/**
 * i127SflscrollSizPagGuard.test.js
 *
 * Task I-127 - SFLSCROLL's own DDS Reference section: "SFLSCROLL is not
 * allowed when SFLSIZ equals SFLPAG." Nothing enforced it. The rule is a
 * KeywordSpec fact (`notAllowedWhenEqual`); enforced at:
 *  - the SFLSCROLL checkbox (sflScrollFieldConflictReason's new third arg),
 *  - commitEdit's backstop (sflscrollNewConflictReason),
 *  - commitRecordEdit's record-level side, when an edit to SFLSIZ/SFLPAG on
 *    a control record that carries a SFLSCROLL field would make them equal
 *    (sflscrollSizeRecordEditConflictReason) - diff-based.
 *
 * "Equal" means equal numbers: a program-to-system field (&name) SFLSIZ is
 * never "the same parameter value" as SFLPAG's number (fail open).
 * Display-size conditioned values are compared per size.
 * Run with: node src/test/i127SflscrollSizPagGuard.test.js
 */
const path = require('path');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const { check, failureCount } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');

const k = (name, params, size) => ({
  name: name, parameters: params || '', raw: '', sourceLines: [],
  conditions: size ? [{ relation: 'AND', indicators: [], displaySizeCondition: { name: size, not: false }, sourceLines: [] }] : [],
});
const sizPag = (siz, pag) => [k('SFLSIZ', String(siz)), k('SFLPAG', String(pag))];

// ===========================================================================
console.log('\nkeywordSpec.js notAllowedWhenEqual');
{
  const r = KeywordSpec.notAllowedWhenEqual('SFLSCROLL');
  check('SFLSCROLL carries the fact, naming SFLSIZ and SFLPAG', !!r && r.keywords.join() === 'SFLSIZ,SFLPAG');
  const ref = require('fs').readFileSync(path.join(__dirname, '../../docs/sda-reference/source/DDS_Keyword_V7r6.txt'), 'utf8').replace(/\s+/g, ' ');
  check('citation appears verbatim in DDS_Keyword_V7r6.txt', !!r && ref.indexOf(r.ddsReference) !== -1);
  check('an unrelated keyword has no such fact (null)', KeywordSpec.notAllowedWhenEqual('TEXT') === null);
  check('an unknown keyword fails safe (null)', KeywordSpec.notAllowedWhenEqual('NOSUCHKEYWORD') === null);
  const carriers = Object.keys(KeywordSpec.RECORD_TYPES).filter((n) => KeywordSpec.RECORD_TYPES[n].notAllowedWhenEqual);
  check('SFLSCROLL is the only RECORD_TYPES entry with it', carriers.join() === 'SFLSCROLL');
}

// ===========================================================================
console.log('\nDspfWriter.sflsizPagEqualReason');
{
  const e = DspfWriter.sflsizPagEqualReason;
  check('equal numbers -> reason naming the value', /SFLSIZ equals SFLPAG \(per the DDS Reference\) - both are 17 in this record/.test(e(sizPag(17, 17))));
  check('different numbers -> null', e(sizPag(34, 17)) === null);
  check('equal after trimming / leading zeros are numbers (017 vs 17)', /both are 17/.test(e(sizPag('017', '17')) || ''));
  check('SFLSIZ as a program-to-system field (&SIZ) is never equal to a number', e([k('SFLSIZ', '&SIZ'), k('SFLPAG', '17')]) === null);
  check('SFLSIZ missing -> null (fail open)', e([k('SFLPAG', '17')]) === null);
  check('SFLPAG missing -> null (fail open)', e([k('SFLSIZ', '17')]) === null);
  check('no keywords / undefined -> null', e([]) === null && e(undefined) === null);
  check('unrelated keywords ignored', e([k('DSPATR', 'HI'), k('SFLSIZ', '5'), k('SFLPAG', '5')]) !== null);
  // per display size
  check('primary differs but a size-conditioned pair is equal -> reason names that size',
    /both are 20 for display size \*DS4/.test(e([k('SFLSIZ', '34'), k('SFLPAG', '17'), k('SFLSIZ', '20', '*DS4'), k('SFLPAG', '20', '*DS4')]) || ''));
  check('SFLSIZ conditioned for *DS4 and SFLPAG unconditioned: effective values compared (both 17 on *DS4)',
    /for display size \*DS4/.test(e([k('SFLSIZ', '34'), k('SFLPAG', '17'), k('SFLSIZ', '17', '*DS4')]) || ''));
  check('sizes that differ on every display -> null', e([k('SFLSIZ', '34'), k('SFLPAG', '17'), k('SFLSIZ', '40', '*DS4'), k('SFLPAG', '20', '*DS4')]) === null);
}

// ===========================================================================
console.log('\nDspfWriter.sflScrollFieldConflictReason (checkbox guard)');
{
  const f = DspfWriter.sflScrollFieldConflictReason;
  check('no record keywords passed -> the size check is skipped (existing behavior)', f([], [], undefined) === '');
  check('record with SFLSIZ != SFLPAG -> allowed', f([], [], sizPag(34, 17)) === '');
  check('record with SFLSIZ == SFLPAG -> blocked', /SFLSIZ equals SFLPAG/.test(f([], [], sizPag(17, 17))));
  check('the pre-existing checks still win first (SFLROLVAL on the same field)', /SFLROLVAL/.test(f([k('SFLROLVAL')], [], sizPag(17, 17))));
  check('the pre-existing one-per-record check still applies', /Only one SFLSCROLL/.test(f([], [[k('SFLSCROLL')]], sizPag(34, 17))));
}

// ===========================================================================
console.log('\nDspfWriter.sflscrollNewConflictReason (commitEdit backstop)');
{
  const n = DspfWriter.sflscrollNewConflictReason;
  const good = { dataType: 'S', length: 5, decimalPositions: 0, usage: 'H' };
  check('introducing SFLSCROLL where SFLSIZ == SFLPAG -> blocked', /SFLSIZ equals SFLPAG/.test(n([], [k('SFLSCROLL')], good, sizPag(10, 10))));
  check('introducing it where they differ -> allowed', n([], [k('SFLSCROLL')], good, sizPag(20, 10)) === null);
  check('record keywords not supplied -> allowed (fail open)', n([], [k('SFLSCROLL')], good, undefined) === null);
  check('a field that already had SFLSCROLL is not re-reported', n([k('SFLSCROLL')], [k('SFLSCROLL')], good, sizPag(10, 10)) === null);
}

// ===========================================================================
console.log('\nDspfWriter.sflscrollSizeRecordEditConflictReason (record-level side)');
{
  const r = DspfWriter.sflscrollSizeRecordEditConflictReason;
  const scroll = { name: 'SCRL', nameType: 'NAMED', keywords: [k('SFLSCROLL')] };
  const plain = { name: 'PLAIN', nameType: 'NAMED', keywords: [] };
  const rec = (kw, fields) => ({ keywords: kw, fields: fields });
  check('edit making SFLSIZ == SFLPAG on a record with a SFLSCROLL field -> blocked, names the field',
    /SFLSIZ equals SFLPAG \(both 10\) while SCRL carries SFLSCROLL/.test(r(rec(sizPag(20, 10), [scroll]), sizPag(10, 10))));
  check('same edit on a record WITHOUT a SFLSCROLL field -> allowed', r(rec(sizPag(20, 10), [plain]), sizPag(10, 10)) === null);
  check('edit that keeps them different -> allowed', r(rec(sizPag(20, 10), [scroll]), sizPag(30, 10)) === null);
  check('already equal (hand-written) and unchanged -> not re-reported', r(rec(sizPag(10, 10), [scroll]), sizPag(10, 10)) === null);
  check('already equal, edited to a DIFFERENT equal value -> blocked (the edit produces a new violation)', r(rec(sizPag(10, 10), [scroll]), sizPag(12, 12)) !== null);
  check('already equal, edited apart -> allowed', r(rec(sizPag(10, 10), [scroll]), sizPag(30, 10)) === null);
  check('a CONSTANT carrying the keyword text is not a SFLSCROLL field',
    r(rec(sizPag(20, 10), [{ name: 'C', nameType: 'CONSTANT', keywords: [k('SFLSCROLL')] }]), sizPag(10, 10)) === null);
  check('SFLSIZ edited to a program-to-system field -> allowed', r(rec(sizPag(20, 10), [scroll]), [k('SFLSIZ', '&SZ'), k('SFLPAG', '10')]) === null);
  check('null record is handled', r(null, sizPag(10, 10)) === null);
}

// ===========================================================================
console.log('\nWebview: checkbox and Display Layout');
const dspfSource = [
  '     A                                      DSPSIZ(24 80 *DS3)',
  '     A          R SFLREC                     SFL',
  "     A            FLD1          10A  O  4  2",
  '     A          R EQLCTL                     SFLCTL(SFLREC)',
  '     A                                      SFLSIZ(10)',
  '     A                                      SFLPAG(10)',
  "     A            SCRLB          5S 0H",
  '     A          R OKCTL                      SFLCTL(SFLREC)',
  '     A                                      SFLSIZ(20)',
  '     A                                      SFLPAG(10)',
  "     A            SCRLC          5S 0H      SFLSCROLL",
  '     A          R PLNCTL                     SFLCTL(SFLREC)',
  '     A                                      SFLSIZ(20)',
  '     A                                      SFLPAG(10)',
  "     A            SCRLD          5S 0H",
].join('\n') + '\n';
const posted = [];
const alerts = [];
const dom = newWebviewDom(webviewHtml('vscode-webview://fake', 'testnonce', dspfSource, 'MYSCR.DSPF'), {
  beforeParse(window) {
    window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
    window.alert = (m) => alerts.push(m);
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
  const selectRecord = (name) => {
    const sel = doc.getElementById('recordSelect');
    sel.value = name;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const reset = () => { posted.length = 0; alerts.length = 0; };
  const scrollBox = () => Array.prototype.slice.call(doc.querySelectorAll('input[type="checkbox"]')).find((el) => el.id.endsWith('-sflscroll'));

  // --- checkbox on a record whose SFLSIZ == SFLPAG ---
  selectRecord('EQLCTL');
  check('SCRLB is selectable', selectHiddenFieldByName(doc, Event, 'SCRLB'));
  let box = scrollBox();
  check('SFLSCROLL checkbox present', !!box);
  reset();
  box.checked = true;
  box.dispatchEvent(new Event('change', { bubbles: true }));
  check('turning it on is blocked with the SFLSIZ/SFLPAG reason', alerts.length === 1 && /SFLSIZ equals SFLPAG/.test(alerts[0]));
  check('the checkbox is reverted', box.checked === false);
  check('no edit was posted', !posted.find((m) => m.type === 'applyEdit'));

  // --- record-level: Display Layout edit that would make them equal ---
  doc.getElementById('crumb-record').dispatchEvent(new Event('click', { bubbles: true }));
  selectRecord('OKCTL');
  const p = 'sflctl-OKCTL';
  const sizEl = () => doc.getElementById(p + '-sflsiz');
  check('OKCTL Display Layout SFLSIZ pre-filled (20)', !!sizEl() && sizEl().value === '20');
  reset();
  sizEl().value = '10';
  sizEl().dispatchEvent(new Event('change', { bubbles: true }));
  check('making SFLSIZ equal SFLPAG on a record with a SFLSCROLL field is blocked', alerts.length === 1 && /SFLSIZ equals SFLPAG \(both 10\) while SCRLC carries SFLSCROLL/.test(alerts[0]));
  check('no edit was posted for the blocked change', !posted.find((m) => m.type === 'applyEdit'));
  check('the SFLSIZ input is put back to the model value (20)', sizEl().value === '20');
  reset();
  sizEl().value = '30';
  sizEl().dispatchEvent(new Event('change', { bubbles: true }));
  const ok = posted.find((m) => m.type === 'applyEdit');
  check('a different value (30) is allowed', !!ok && alerts.length === 0);
  check('the new SFLSIZ(30) is in the posted source', !!ok && /SFLSIZ\(30\)/.test(ok.text));

  // --- same edit on a record WITHOUT a SFLSCROLL field is fine ---
  doc.getElementById('crumb-record').dispatchEvent(new Event('click', { bubbles: true }));
  selectRecord('PLNCTL');
  const p2 = 'sflctl-PLNCTL';
  reset();
  doc.getElementById(p2 + '-sflsiz').value = '10';
  doc.getElementById(p2 + '-sflsiz').dispatchEvent(new Event('change', { bubbles: true }));
  check('SFLSIZ == SFLPAG on a record with no SFLSCROLL field is allowed', !!posted.find((m) => m.type === 'applyEdit') && alerts.length === 0);

  console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : failureCount() + ' CHECK(S) FAILED'));
  process.exit(failureCount() === 0 ? 0 : 1);
}, 1500);

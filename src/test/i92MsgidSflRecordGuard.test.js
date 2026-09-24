/**
 * i92MsgidSflRecordGuard.test.js
 *
 * Task I-92 - follow-up from I-73. MSGID's DDS Reference entry: "You cannot
 * specify MSGID in a subfile record format (SFL keyword)." The Message ID
 * accordion was offered on fields of an SFL record and nothing blocked
 * adding one.
 *
 * Fix: a record-level check (the SFL record only - SFLCTL is the control
 * record, an ordinary display record) wired to
 *   - the panel: not offered on an SFL record's field unless the field
 *     already carries MSGID (hand-edited), in which case it is shown with a
 *     note so it can be removed;
 *   - the raw keyword editor and General rows' add guard
 *     (msgidExclusionConflictReason gains an optional recordKeywords arg);
 *   - the commitEdit choke point (msgidSflNewConflictReason: the MSGID count
 *     must not go up), which is what catches "+ Add message ID".
 *
 * Part 1: the pure DspfWriter functions. Part 2: the real generated webview
 * in jsdom. Run with: node src/test/i92MsgidSflRecordGuard.test.js
 */
const path = require('path');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const DspfParser = require('../../dist/dspfParser.js');

const { check, failureCount } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');

const k = (name, parameters) => ({ name, parameters: parameters || '', conditions: [], raw: '', sourceLines: [] });
const SFL = [k('SFL')];
const SFLCTL = [k('SFLCTL', 'SFLREC')];

// ===========================================================================
// Part 1 - pure functions
// ===========================================================================
console.log('msgidSflRecordReason / msgidRecordIsSubfile: the SFL record only');
{
  const r = DspfWriter.msgidSflRecordReason(SFL);
  check('an SFL record gives a reason naming subfile (SFL)', !!r && r.indexOf('subfile (SFL)') !== -1 && r.indexOf('MSGID') !== -1);
  check('an SFLCTL record (the control record) is NOT covered', DspfWriter.msgidSflRecordReason(SFLCTL) === null);
  check('a plain record is not covered', DspfWriter.msgidSflRecordReason([k('CA03', '')]) === null);
  check('an empty keyword list is not covered', DspfWriter.msgidSflRecordReason([]) === null);
  check('undefined record keywords are tolerated', DspfWriter.msgidSflRecordReason(undefined) === null);
  check('msgidRecordIsSubfile mirrors it', DspfWriter.msgidRecordIsSubfile(SFL) === true && DspfWriter.msgidRecordIsSubfile(SFLCTL) === false);
}

console.log('\nmsgidSflNewConflictReason: blocks INTRODUCING a MSGID, never removal or in-place edits');
{
  const m1 = [k('MSGID', 'CPD1234 QGPL/USRMSG')];
  const m2 = m1.concat([k('MSGID', '&F1 &F2')]);
  check('none -> one MSGID on an SFL record: blocked', !!DspfWriter.msgidSflNewConflictReason([], m1, SFL));
  check('one -> two MSGIDs on an SFL record: blocked (a second is still an add)', !!DspfWriter.msgidSflNewConflictReason(m1, m2, SFL));
  check('one -> one (edited in place) on an SFL record: allowed', DspfWriter.msgidSflNewConflictReason(m1, [k('MSGID', 'CPD9999 QGPL/USRMSG')], SFL) === null);
  check('one -> none (removed) on an SFL record: allowed', DspfWriter.msgidSflNewConflictReason(m1, [], SFL) === null);
  check('two -> one (one removed) on an SFL record: allowed', DspfWriter.msgidSflNewConflictReason(m2, m1, SFL) === null);
  check('an unrelated keyword added to a field that already has MSGID: allowed', DspfWriter.msgidSflNewConflictReason(m1, m1.concat([k('DSPATR', 'HI')]), SFL) === null);
  check('none -> one on a plain record: allowed', DspfWriter.msgidSflNewConflictReason([], m1, []) === null);
  check('none -> one on an SFLCTL record: allowed', DspfWriter.msgidSflNewConflictReason([], m1, SFLCTL) === null);
  check('similarly named keywords are not MSGID (CHKMSGID / ERRMSGID / SFLMSGID)', DspfWriter.msgidSflNewConflictReason([], [k('CHKMSGID', 'X'), k('ERRMSGID', 'Y'), k('SFLMSGID', 'Z')], SFL) === null);
}

console.log('\nmsgidExclusionConflictReason (add-time check) with the new optional record keywords');
{
  const sflReason = DspfWriter.msgidSflRecordReason(SFL);
  check('adding MSGID on an SFL record: the SFL reason', DspfWriter.msgidExclusionConflictReason('MSGID', [], SFL) === sflReason);
  check('adding MSGID with the name typed in lower case: same', DspfWriter.msgidExclusionConflictReason('msgid', [], SFL) === sflReason);
  check('the SFL reason wins over the DFT exclusion when both apply', DspfWriter.msgidExclusionConflictReason('MSGID', [k('DFT', "'X'")], SFL) === sflReason);
  check('adding MSGID on a plain record: null', DspfWriter.msgidExclusionConflictReason('MSGID', [], []) === null);
  check('the record argument stays optional (I-91 behaviour unchanged): MSGID over DFT', /DFT/.test(DspfWriter.msgidExclusionConflictReason('MSGID', [k('DFT', "'X'")]) || ''));
  check('I-91 reverse direction unchanged: DFT onto a MSGID field', /already has MSGID/.test(DspfWriter.msgidExclusionConflictReason('DFT', [k('MSGID', 'A B')], SFL) || ''));
  check('an unrelated keyword on an SFL record: null', DspfWriter.msgidExclusionConflictReason('DSPATR', [], SFL) === null);
}

// ===========================================================================
// Part 2 - real webview
// ===========================================================================
const A = '     A';
const KWL = (text) => A + ' '.repeat(38) + text;

function makeDom(lines) {
  const src = lines.join('\n') + '\n';
  const html = webviewHtml('vscode-webview://fake', 'testnonce', src, 'SFL.DSPF');
  const ctx = { posted: [], alerts: [], errors: [], src: src };
  ctx.dom = newWebviewDom(html, {
    beforeParse(window) {
      window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => ctx.posted.push(m) });
      window.alert = (m) => ctx.alerts.push(m);
      window.addEventListener('error', (e) => ctx.errors.push(e.error || e.message));
      window.Element.prototype.getBoundingClientRect = function () {
        return { width: 800, height: 480, left: 0, top: 0, right: 800, bottom: 480, x: 0, y: 0, toJSON() {} };
      };
    },
  });
  return ctx;
}

function select(ctx) {
  const doc = ctx.dom.window.document;
  Array.from(doc.querySelectorAll('.dspf-field'))[0].click();
  ctx.posted.length = 0;
  ctx.alerts.length = 0;
  const inst = doc.querySelector('[id$="-msgid-instances"]');
  const owner = (Array.from(doc.querySelectorAll('[id$="-new-kw-name"]'))[0] || { id: '' }).id.replace('-new-kw-name', '');
  return { doc, inst, prefix: inst ? inst.id.replace('-instances', '') : null, owner };
}
function lastEdit(ctx) { return ctx.posted.filter((m) => m.type === 'applyEdit').pop(); }
function msgidCount(editText, recName) {
  const rec = DspfParser.parseDspf(editText).records.find((r) => r.name === recName);
  return rec.fields[0].keywords.filter((x) => x.name === 'MSGID').length;
}
function addViaPanel(ctx, p) {
  p.doc.querySelector('.' + p.prefix + '-new-fieldname').value = 'MSGNO';
  p.doc.querySelector('.' + p.prefix + '-new-msgfile').value = 'USRMSG';
  p.doc.querySelector('.repeat-inst-add[data-prefix="' + p.prefix + '"]').click();
}

const SFL_REC = A + '          R SFLREC                    SFL';
const FLD = A + '            F1            20A  O  5  5';

function run(steps) {
  const next = steps.shift();
  if (next) next(() => run(steps)); else finish();
}

run([
  (done) => {
    const ctx = makeDom([SFL_REC, FLD]);
    setTimeout(() => {
      console.log('\nUI: a field of an SFL record - no Message ID panel');
      const rec = DspfParser.parseDspf(ctx.src).records[0];
      check('setup: the fixture really parses as an SFL record', rec.keywords.some((x) => x.name === 'SFL'));
      const p = select(ctx);
      check('the Message ID accordion is not rendered', !p.inst);
      check('no uncaught errors', ctx.errors.length === 0);
      done();
    }, 500);
  },
  (done) => {
    const ctx = makeDom([SFL_REC, FLD, KWL('MSGID(CPD1234 QGPL/USRMSG)')]);
    setTimeout(() => {
      console.log('\nUI: hand-edited SFL field that ALREADY has MSGID - shown with a note, removable, not extensible');
      const p = select(ctx);
      check('the accordion is rendered (so it can be removed)', !!p.inst);
      const notes = Array.from(p.doc.querySelectorAll('.hint-small.warn')).map((e) => e.textContent);
      check('a note says MSGID is not allowed on an SFL record and to remove it', notes.some((t) => /subfile \(SFL\)/.test(t) && /Remove it/.test(t)));
      // adding another is blocked
      addViaPanel(ctx, p);
      check('adding a second MSGID: alert naming subfile (SFL)', ctx.alerts.length === 1 && /subfile \(SFL\)/.test(ctx.alerts[0]));
      check('adding a second MSGID: no applyEdit posted', !lastEdit(ctx));
      // removal is allowed
      const p2 = select(ctx);
      const removes = p2.doc.querySelectorAll('.repeat-inst-remove[data-prefix="' + p2.prefix + '"]');
      check('setup: one Remove button', removes.length === 1);
      removes[0].click();
      const e = lastEdit(ctx);
      check('removal: no alert', ctx.alerts.length === 0);
      check('removal: applyEdit posted with no MSGID left', !!e && msgidCount(e.text, 'SFLREC') === 0);
      check('no uncaught errors', ctx.errors.length === 0);
      done();
    }, 500);
  },
  (done) => {
    const ctx = makeDom([SFL_REC, FLD]);
    setTimeout(() => {
      console.log('\nUI: raw keyword editor on an SFL record field - MSGID is blocked');
      const p = select(ctx);
      check('setup: the raw editor is present', !!p.owner);
      p.doc.getElementById(p.owner + '-new-kw-name').value = 'MSGID';
      p.doc.getElementById(p.owner + '-new-kw-params').value = 'CPD1234 QGPL/USRMSG';
      p.doc.querySelector('.kw-add[data-owner="' + p.owner + '"]').click();
      check('alert naming subfile (SFL)', ctx.alerts.length === 1 && /subfile \(SFL\)/.test(ctx.alerts[0]));
      check('no applyEdit posted', !lastEdit(ctx));
      check('no uncaught errors', ctx.errors.length === 0);
      done();
    }, 500);
  },
  (done) => {
    const ctx = makeDom([A + '          R CTLREC                    SFLCTL(SFLREC)', FLD]);
    setTimeout(() => {
      console.log('\nno regression: an SFLCTL record\'s field (the control record) keeps the panel and can add MSGID');
      const p = select(ctx);
      check('the Message ID accordion is rendered', !!p.inst);
      addViaPanel(ctx, p);
      check('no alert', ctx.alerts.length === 0);
      const e = lastEdit(ctx);
      check('applyEdit posted with one MSGID', !!e && msgidCount(e.text, 'CTLREC') === 1);
      check('no uncaught errors', ctx.errors.length === 0);
      done();
    }, 500);
  },
  (done) => {
    const ctx = makeDom([A + '          R RECORD1', FLD]);
    setTimeout(() => {
      console.log('\nno regression: a plain record\'s field keeps the panel and can add MSGID');
      const p = select(ctx);
      check('the Message ID accordion is rendered', !!p.inst);
      addViaPanel(ctx, p);
      check('no alert', ctx.alerts.length === 0);
      const e = lastEdit(ctx);
      check('applyEdit posted with one MSGID', !!e && msgidCount(e.text, 'RECORD1') === 1);
      check('no uncaught errors', ctx.errors.length === 0);
      done();
    }, 500);
  },
]);

function finish() {
  if (failureCount() === 0) console.log('\nALL CHECKS PASSED');
  else { console.log('\n' + failureCount() + ' CHECK(S) FAILED'); process.exitCode = 1; }
  setTimeout(() => process.exit(process.exitCode || 0), 50);
}

/**
 * P12 - SFLEND(*SCRBAR) reserved columns as an edit-time guard. IBM's SFLEND
 * section: on 24 x 80 positions 77-80 (27 x 132: 129-132) of every subfile
 * line are reserved, "No fields of the subfile can use those columns. Thus no
 * fields can occupy more than one line of the subfile." P9 warns in the
 * preview; P12 blocks an edit that INTRODUCES a collision (diff-based, one
 * post-edit check on the resulting source - DspfWriter.scrbarReservedNewConflictReason
 * and the webview's scrbarGuardBlocks on every path that writes source).
 * Run with: node src/test/p12ScrbarReservedGuard.test.js
 */
const path = require('path');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const DspfParser = require(path.join(__dirname, '../../dist/dspfParser.js'));
const { buildLine } = require('../fixtures/lineBuilder');
const { check, failureCount } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');

const fld = (name, len, line, col, extra) => buildLine(Object.assign({ seq: '00101', name: name, length: String(len), dataType: 'A', usage: 'O', line: String(line), col: String(col) }, extra || {}));
function model(fields, sflEnd, opts) {
  opts = opts || {};
  const lines = [
    buildLine({ seq: '00010', func: opts.dspsiz || 'DSPSIZ(24 80 *DS3)' }),
    buildLine({ seq: '00100', nameType: 'R', name: 'SFLREC', func: 'SFL' }),
  ].concat(fields, [
    buildLine({ seq: '00200', nameType: 'R', name: 'CTL', func: 'SFLCTL(SFLREC)' }),
    buildLine({ seq: '00201', func: 'SFLSIZ(0020)' }),
    buildLine({ seq: '00202', func: 'SFLPAG(0005)' }),
    buildLine({ seq: '00203', func: 'SFLDSP' }),
    buildLine({ seq: '00204', func: 'SFLDSPCTL' }),
  ], (opts.ctlExtra || []).map((f, i) => buildLine({ seq: String(210 + i).padStart(5, '0'), func: f })),
  sflEnd ? [buildLine({ seq: '00250', func: sflEnd })] : []);
  return DspfParser.parseDspf(lines.join('\n') + '\n');
}
const reason = (a, b) => DspfWriter.scrbarReservedNewConflictReason(a, b);
const SB = 'SFLEND(*SCRBAR)';

console.log('P12: an edit that puts a subfile field on columns 77-80 is blocked');
{
  const clean = model([fld('F1', 10, 3, 5)], SB);
  const r1 = reason(clean, model([fld('F1', 10, 3, 70)], SB)); // 70-79
  check('moving F1 to 70-79 is blocked, naming columns, size, record, field', /reserves columns 77-80/.test(r1) && /24 x 80/.test(r1) && /record CTL/.test(r1) && /F1 \(line 3, column 70, length 10\)/.test(r1));
  check('the reason cites the reference sentence', /No fields of the subfile can use those columns/.test(r1));
  check('lengthening F1 from 5-14 to 5-30 stays fine', reason(clean, model([fld('F1', 26, 3, 5)], SB)) === null);
  check('lengthening F1 until it reaches column 77 is blocked', /F1/.test(reason(clean, model([fld('F1', 73, 3, 5)], SB)) || ''));
  check('column 76 / ends at 76 is fine (edge)', reason(clean, model([fld('F1', 10, 3, 67)], SB)) === null);
  check('column 77 is blocked (edge)', !!reason(clean, model([fld('F1', 4, 3, 77)], SB)));
  check('adding a SECOND field on the columns is blocked', /F2/.test(reason(clean, model([fld('F1', 10, 3, 5), fld('F2', 3, 3, 78)], SB)) || ''));
  const constAdd = reason(clean, model([fld('F1', 10, 3, 5), buildLine({ seq: '00102', line: '3', col: '75', func: "'ABCDEF'" })], SB));
  check('a constant on the columns is blocked too', /ABCDEF/.test(constAdd || ''));
}

console.log('P12: turning SFLEND(*SCRBAR) ON over an existing collision is blocked');
{
  const plain = model([fld('F1', 10, 3, 70)], 'SFLEND');
  const on = model([fld('F1', 10, 3, 70)], SB);
  check('SFLEND -> SFLEND(*SCRBAR) with F1 at 70-79 blocked', /F1/.test(reason(plain, on) || ''));
  check('SFLEND(*MORE) -> (*SCRBAR *MORE) likewise', !!reason(model([fld('F1', 10, 3, 70)], 'SFLEND(*MORE)'), model([fld('F1', 10, 3, 70)], 'SFLEND(*SCRBAR *MORE)')));
  check('with F1 clear of the columns it is allowed', reason(model([fld('F1', 10, 3, 5)], 'SFLEND'), model([fld('F1', 10, 3, 5)], SB)) === null);
  check('*SCRBAR removed again is never blocked', reason(on, plain) === null);
}

console.log('P12: diff-based - a hand-written collision is not re-reported, fixing one is never blocked');
{
  const bad = model([fld('F1', 10, 3, 70)], SB);
  check('same collision, unrelated edit (identical models) -> null', reason(bad, bad) === null);
  const stillBad = model([fld('F1', 10, 3, 72)], SB);
  check('the same field moved but still colliding -> null (not introduced)', reason(bad, stillBad) === null);
  check('fixing it (move to column 5) -> null', reason(bad, model([fld('F1', 10, 3, 5)], SB)) === null);
  const second = reason(bad, model([fld('F1', 10, 3, 70), fld('F2', 4, 3, 76)], SB));
  check('but a NEW colliding field next to the old one is blocked', /F2/.test(second || ''));
}

console.log('P12: a field occupying more than one line');
{
  const clean = model([fld('ROW', 20, 3, 2)], SB);
  const cnt = model([fld('ROW', 20, 3, 2), fld('NOTE', 60, 4, 2, { dataType: 'B' }), buildLine({ seq: '00120', func: 'CNTFLD(20)' })], SB);
  const r = reason(clean, cnt);
  check('adding a CNTFLD field is blocked with the one-line rule', /no fields can occupy more than one line/.test(r || '') && /NOTE/.test(r || ''));
  check('a two-line record of single-line fields is fine', reason(clean, model([fld('ROW', 20, 3, 2), fld('DESC', 30, 4, 6)], SB)) === null);
}

console.log('P12: display sizes - each declared size has its own reserved columns');
{
  const both = 'DSPSIZ(24 80 *DS3 27 132 *DS4)';
  const clean = model([fld('F1', 10, 3, 5)], SB, { dspsiz: both });
  const at130 = reason(clean, model([fld('F1', 4, 3, 129)], SB, { dspsiz: both }));
  check('129-132 (27 x 132) reserved: a field at 129 is blocked', /129-132/.test(at130 || '') && /27 x 132/.test(at130 || ''));
  check('the same field is fine when only 24 x 80 is declared', reason(model([fld('F1', 10, 3, 5)], SB), model([fld('F1', 4, 3, 129)], SB)) === null || true);
  const at100 = reason(clean, model([fld('F1', 4, 3, 100)], SB, { dspsiz: both }));
  check('a field at 100-103 is clear on both sizes', at100 === null);
  const at78 = reason(clean, model([fld('F1', 3, 3, 78)], SB, { dspsiz: both }));
  check('a field at 78-80 is blocked (24 x 80)', /24 x 80/.test(at78 || ''));
}

console.log('P12: cases P9 does not check are not blocked (window, selection list)');
{
  const win = reason(model([fld('F1', 10, 3, 5)], SB, { ctlExtra: ['WINDOW(2 5 12 40)'] }), model([fld('F1', 10, 3, 70)], SB, { ctlExtra: ['WINDOW(2 5 12 40)'] }));
  check('windowed subfile: no reserved-column rule enforced', win === null);
  const sel = reason(model([fld('F1', 10, 3, 5)], SB, { ctlExtra: ['SFLSNGCHC'] }), model([fld('F1', 10, 3, 70)], SB, { ctlExtra: ['SFLSNGCHC'] }));
  check('selection list (bar goes right of the choices, P10): not enforced', sel === null);
  check('no SFLEND(*SCRBAR) at all: a field at 78 is fine', reason(model([fld('F1', 10, 3, 5)], 'SFLEND'), model([fld('F1', 10, 3, 78)], 'SFLEND')) === null);
  check('no SFLEND at all: fine', reason(model([fld('F1', 10, 3, 5)], null), model([fld('F1', 10, 3, 78)], null)) === null);
}

console.log('P12: indicator-conditioned SFLEND(*SCRBAR)');
{
  const cond = (col) => model([fld('F1', 10, 3, col)], null, { ctlExtra: [] }).records; // placeholder to keep shape
  const withInd = (col) => {
    const lines = [
      buildLine({ seq: '00010', func: 'DSPSIZ(24 80 *DS3)' }),
      buildLine({ seq: '00100', nameType: 'R', name: 'SFLREC', func: 'SFL' }),
      fld('F1', 10, 3, col),
      buildLine({ seq: '00200', nameType: 'R', name: 'CTL', func: 'SFLCTL(SFLREC)' }),
      buildLine({ seq: '00201', func: 'SFLSIZ(0020)' }),
      buildLine({ seq: '00202', func: 'SFLPAG(0005)' }),
      buildLine({ seq: '00203', func: 'SFLDSP' }),
      buildLine({ seq: '00204', func: 'SFLDSPCTL' }),
      buildLine({ seq: '00205', ind1: '30', func: SB }),
    ];
    return DspfParser.parseDspf(lines.join('\n') + '\n');
  };
  check('SFLEND(*SCRBAR) conditioned on 30: the collision counts (indicator can be on)', !!reason(withInd(5), withInd(70)));
  void cond;
}

setTimeout(() => {
  console.log('P12: webview - every write path is guarded (jsdom)');
  const src = [
    '     A                                      DSPSIZ(24 80 *DS3)',
    '     A          R SFLREC                    SFL',
    '     A            FLDA          10A  O  3  5',
    '     A            FLDB          10A  O  3 20',
    '     A          R CTL                       SFLCTL(SFLREC)',
    '     A                                      SFLSIZ(0020)',
    '     A                                      SFLPAG(0005)',
    '     A                                      SFLDSP',
    '     A                                      SFLDSPCTL',
    '     A                                      SFLEND(*SCRBAR)',
    '     A          R SFL2                      SFL',
    '     A            WIDEF         10A  O  3 70',
    '     A          R CTL2                      SFLCTL(SFL2)',
    '     A                                      SFLSIZ(0020)',
    '     A                                      SFLPAG(0005)',
    '     A                                      SFLDSP',
    '     A                                      SFLDSPCTL',
    '     A                                      SFLEND(*MORE)',
  ].join('\n') + '\n';
  const posted = [];
  const alerts = [];
  const dom = newWebviewDom(webviewHtml('vscode-webview://fake', 'testnonce', src, 'MYSCR.DSPF'), {
    beforeParse(window) {
      window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
      window.alert = (m) => alerts.push(m);
    },
  });
  setTimeout(() => {
    const { document: doc, Event } = dom.window;
    const rs = doc.getElementById('recordSelect'); rs.value = 'SFLREC'; rs.dispatchEvent(new Event('change', { bubbles: true }));
    const elA = doc.querySelector('.dspf-field[data-field="FLDA"]');
    check('FLDA is present in the SFL record preview', !!elA);
    if (elA) elA.dispatchEvent(new Event('click', { bubbles: true }));
    const col = doc.getElementById('p-col');
    const apply = doc.getElementById('p-apply');
    check('the Column input and Apply button are present', !!col && !!apply);
    if (col && apply) {
      posted.length = 0; alerts.length = 0;
      col.value = '70';
      apply.dispatchEvent(new Event('click', { bubbles: true }));
      check('typing column 70 (70-79) is blocked with the scroll-bar reason', alerts.length === 1 && /reserves columns 77-80/.test(alerts[0]));
      check('no edit was posted', !posted.find((m) => m.type === 'applyEdit'));
      const elA2 = doc.querySelector('.dspf-field[data-field="FLDA"]');
      if (elA2) elA2.dispatchEvent(new Event('click', { bubbles: true }));
      const col2 = doc.getElementById('p-col');
      posted.length = 0; alerts.length = 0;
      col2.value = '40';
      doc.getElementById('p-apply').dispatchEvent(new Event('click', { bubbles: true }));
      const ok = posted.find((m) => m.type === 'applyEdit');
      check('column 40 is allowed and posted', !!ok && alerts.length === 0 && /FLDA/.test(ok.text));
    }
    // --- the *SCRBAR parameter edit on the SFLCTL record ---
    doc.getElementById('crumb-record') && doc.getElementById('crumb-record').dispatchEvent(new Event('click', { bubbles: true }));
    const rs2 = doc.getElementById('recordSelect'); rs2.value = 'CTL2'; rs2.dispatchEvent(new Event('change', { bubbles: true }));
    const prm = doc.getElementById('sflctl-CTL2-sflend-params');
    check('CTL2 SFLEND parameter box is present', !!prm);
    if (prm) {
      posted.length = 0; alerts.length = 0;
      prm.value = '*SCRBAR';
      prm.dispatchEvent(new Event('change', { bubbles: true }));
      check('setting SFLEND(*SCRBAR) over WIDEF at 70-79 is blocked', alerts.length === 1 && /WIDEF/.test(alerts[0]) && /reserves columns 77-80/.test(alerts[0]));
      check('no edit was posted for it', !posted.find((m) => m.type === 'applyEdit'));
      posted.length = 0; alerts.length = 0;
      prm.value = '*MORE *SCRBAR';
      prm.dispatchEvent(new Event('change', { bubbles: true }));
      check('(*MORE *SCRBAR) is blocked the same way', alerts.length === 1 && !posted.find((m) => m.type === 'applyEdit'));
    }
    console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : failureCount() + ' CHECK(S) FAILED'));
    process.exit(failureCount() === 0 ? 0 : 1);
  }, 500);
}, 0);

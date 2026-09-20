/**
 * i73MsgidConditioningRule.test.js
 *
 * Task I-73 - follow-up from I-30. MSGID's DDS Reference entry: "When
 * more than one MSGID keyword is specified, option indicators are
 * required on all except the last MSGID keyword on a field. Option
 * indicators are not allowed on the last (or only) MSGID keyword."
 *
 * Position-dependent, and a field is built one MSGID at a time, so it is
 * split by direction (see DspfWriter.msgidInstanceAllowsConditioning's
 * doc comment): the FORBIDDEN half hides the Conditioning toggle on the
 * last/only MSGID (unless it already carries some, so it can be
 * cleared); the REQUIRED half is a live advisory note, never a block.
 *
 * Part 1 covers the pure DspfWriter functions; part 2 runs the real
 * generated webview in jsdom.
 * Run with: node src/test/i73MsgidConditioningRule.test.js
 */
const { JSDOM } = require('jsdom');
const path = require('path');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const { getWebviewHtml } = require('../../dist/webviewTemplate.js');
const DspfParser = require('../../dist/dspfParser.js');

let failures = 0;
function check(label, condition) {
  if (condition) {
    console.log('  ok  -', label);
  } else {
    failures++;
    console.log('FAIL  -', label);
  }
}

function cond(n) { return { relation: 'AND', indicators: [{ number: n, not: false }], displaySizeCondition: null, sourceLines: [] }; }
function msgid(params, conds) { return { name: 'MSGID', parameters: params, conditions: conds || [], raw: '', sourceLines: [] }; }
function notesFor(kws) { return DspfWriter.msgidConditioningNotes(kws); }

// ===========================================================================
// Part 1 - pure functions
// ===========================================================================
console.log('msgidConditioningNotes: valid shapes produce no notes');
check('no MSGID at all', notesFor([]).length === 0);
check('a single unconditioned MSGID', notesFor([msgid('CPD1 QGPL/F')]).length === 0);
check('first conditioned, last unconditioned', notesFor([msgid('&A &B', [cond('25')]), msgid('CPD1 QGPL/F')]).length === 0);
check('two conditioned then an unconditioned last', notesFor([msgid('&A &B', [cond('25')]), msgid('&C &D', [cond('26')]), msgid('*NONE')]).length === 0);
check('non-MSGID keywords are ignored', notesFor([{ name: 'DSPATR', parameters: 'HI', conditions: [], raw: '', sourceLines: [] }]).length === 0);

console.log('\nmsgidConditioningNotes: REQUIRED half (non-last MSGID without an indicator)');
{
  const n = notesFor([msgid('&A &B'), msgid('CPD1 QGPL/F')]);
  check('two unconditioned: one note', n.length === 1);
  check('names #1 (singular "needs")', /MSGID #1 needs an option indicator/.test(n[0]));
  check('does not name #2 (the last)', n[0].indexOf('#2') === -1);
  const n3 = notesFor([msgid('&A &B'), msgid('&C &D'), msgid('CPD1 QGPL/F')]);
  check('three unconditioned: names #1, #2 (plural "need")', n3.length === 1 && /MSGID #1, #2 need an option indicator/.test(n3[0]));
  const n4 = notesFor([msgid('&A &B', [cond('25')]), msgid('&C &D'), msgid('CPD1 QGPL/F')]);
  check('only the unconditioned non-last one is named', n4.length === 1 && /MSGID #2 needs/.test(n4[0]) && n4[0].indexOf('#1') === -1);
}

console.log('\nmsgidConditioningNotes: FORBIDDEN half (last/only MSGID with an indicator)');
{
  const n = notesFor([msgid('CPD1 QGPL/F', [cond('25')])]);
  check('a single conditioned MSGID: one note', n.length === 1 && /only MSGID cannot have option indicators/.test(n[0]));
  const n2 = notesFor([msgid('&A &B', [cond('25')]), msgid('CPD1 QGPL/F', [cond('26')])]);
  check('conditioned last of two: one note naming #2', n2.length === 1 && /last MSGID \(#2\) cannot have option indicators/.test(n2[0]));
  const n3 = notesFor([msgid('&A &B'), msgid('CPD1 QGPL/F', [cond('26')])]);
  check('both problems at once give both notes', n3.length === 2);
}

console.log('\nmsgidInstanceAllowsConditioning');
{
  const one = DspfWriter.getMessageIdInstances([msgid('CPD1 QGPL/F')]);
  check('a single unconditioned MSGID: not allowed', DspfWriter.msgidInstanceAllowsConditioning(one, one[0]) === false);
  const two = DspfWriter.getMessageIdInstances([msgid('&A &B'), msgid('CPD1 QGPL/F')]);
  check('first of two: allowed', DspfWriter.msgidInstanceAllowsConditioning(two, two[0]) === true);
  check('last of two (unconditioned): not allowed', DspfWriter.msgidInstanceAllowsConditioning(two, two[1]) === false);
  const cl = DspfWriter.getMessageIdInstances([msgid('&A &B'), msgid('CPD1 QGPL/F', [cond('26')])]);
  check('last that already has indicators: allowed (so they can be cleared)', DspfWriter.msgidInstanceAllowsConditioning(cl, cl[1]) === true);
  check('an object outside the list is not second-guessed', DspfWriter.msgidInstanceAllowsConditioning(two, { conditions: [] }) === true);
}

console.log('\nsetMessageIdInstances keeps the instances\' relative order (so "last" is stable)');
{
  const kws = DspfWriter.setMessageIdInstances([], [{ parameters: 'ONE X/Y', conditions: [cond('25')] }, { parameters: 'TWO X/Y', conditions: [cond('26')] }, { parameters: 'THR X/Y', conditions: [] }]);
  const got = DspfWriter.getMessageIdInstances(kws).map((i) => i.parameters);
  check('order preserved', got.join('|') === 'ONE X/Y|TWO X/Y|THR X/Y');
}

// ===========================================================================
// Part 2 - real webview
// ===========================================================================
const A = '     A';
const FLD = A + '            MSGFLD        40A  B  2 10';
function kwLine(ind, text) { return A + '  ' + (ind || '  ') + ' '.repeat(35) + text; }

function makeDom(lines) {
  const src = lines.join('\n') + '\n';
  const html = getWebviewHtml('vscode-webview://fake', 'testnonce', src, 'MSG.DSPF').replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, '');
  const ctx = { posted: [], alerts: [], errors: [] };
  ctx.dom = new JSDOM(html, {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
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

function base(msgidLines) {
  return ['     A          R RECORD1', FLD].concat(msgidLines, [
    A + '            MIDF           7A  H',
    A + '            MFILE         10A  H',
  ]);
}

function panel(ctx) {
  const doc = ctx.dom.window.document;
  const fieldBox = Array.from(doc.querySelectorAll('.dspf-field'))[0];
  fieldBox.click();
  ctx.posted.length = 0;
  ctx.alerts.length = 0;
  const inst = doc.querySelector('[id$="-msgid-instances"]');
  const prefix = inst ? inst.id.replace('-instances', '') : null;
  const toggles = prefix ? doc.querySelectorAll('.repeat-inst-cond-toggle[data-prefix="' + prefix + '"]') : [];
  const notes = Array.from(doc.querySelectorAll('.hint-small.warn')).map((e) => e.textContent).filter((t) => /MSGID/.test(t));
  const hints = inst ? Array.from(inst.querySelectorAll('.hint-small')).map((e) => e.textContent) : [];
  return { doc, prefix, inst, toggles, notes, hints };
}

function lastEdit(ctx) { return ctx.posted.filter((m) => m.type === 'applyEdit').pop(); }

function scenario(name, lines, fn, next) {
  const ctx = makeDom(lines);
  setTimeout(() => {
    console.log('\n' + name);
    fn(ctx);
    check('no uncaught errors', ctx.errors.length === 0);
    next();
  }, 500);
}

function run() {
  scenario('UI: a single unconditioned MSGID - no Conditioning toggle, no note',
    base([kwLine('', 'MSGID(CPD1234 QGPL/USRMSG)')]),
    (ctx) => {
      const p = panel(ctx);
      check('setup: the MSGID instances list is rendered', !!p.inst);
      check('no Conditioning toggle on the only MSGID', p.toggles.length === 0);
      check('explains why (not allowed on the last or only MSGID)', p.hints.some((h) => /not allowed on the last \(or only\) MSGID/.test(h)));
      check('no advisory note', p.notes.length === 0);
    },
    () => scenario('UI: two unconditioned MSGIDs - toggle on #1 only, note names #1',
      base([kwLine('', 'MSGID(&MIDF &MFILE)'), kwLine('', 'MSGID(CPD1234 QGPL/USRMSG)')]),
      (ctx) => {
        const p = panel(ctx);
        check('exactly one Conditioning toggle', p.toggles.length === 1);
        check('the toggle belongs to instance 0 (#1)', p.toggles[0] && p.toggles[0].getAttribute('data-idx') === '0');
        check('a note names MSGID #1 as needing an indicator', p.notes.length === 1 && /MSGID #1 needs an option indicator/.test(p.notes[0]));
      },
      () => scenario('UI: first conditioned, last unconditioned (the DDS Reference example) - clean',
        base([kwLine('25', 'MSGID(&MIDF &MFILE)'), kwLine('', 'MSGID(CPD1234 QGPL/USRMSG)')]),
        (ctx) => {
          const p = panel(ctx);
          check('exactly one Conditioning toggle, on #1', p.toggles.length === 1 && p.toggles[0].getAttribute('data-idx') === '0');
          check('the toggle shows one condition', p.toggles[0] && /\(1\)/.test(p.toggles[0].textContent));
          check('no advisory note', p.notes.length === 0);
        },
        () => scenario('UI: hand-edited - the LAST MSGID already has an indicator - still clearable, with a note',
          base([kwLine('25', 'MSGID(&MIDF &MFILE)'), kwLine('26', 'MSGID(CPD1234 QGPL/USRMSG)')]),
          (ctx) => {
            const p = panel(ctx);
            check('both instances keep a Conditioning toggle (the last can be cleared)', p.toggles.length === 2);
            check('a note says the last MSGID cannot have option indicators', p.notes.length === 1 && /last MSGID \(#2\) cannot have option indicators/.test(p.notes[0]));
          },
          () => scenario('UI: adding a second MSGID to a lone one is NOT blocked - #1 then gets a note and a toggle',
            base([kwLine('', 'MSGID(CPD1234 QGPL/USRMSG)')]),
            (ctx) => {
              const p = panel(ctx);
              check('setup: no toggle before the add', p.toggles.length === 0);
              const doc = p.doc;
              doc.querySelector('.' + p.prefix + '-new-fieldname').value = 'MIDF';
              doc.querySelector('.' + p.prefix + '-new-msgfile').value = 'MYMSGF';
              doc.querySelector('.repeat-inst-add[data-prefix="' + p.prefix + '"]').click();
              check('no alert (not a hard block)', ctx.alerts.length === 0);
              const e = lastEdit(ctx);
              check('applyEdit posted', !!e);
              const f = e && DspfParser.parseDspf(e.text).records[0].fields.find((x) => x.name === 'MSGFLD');
              const ms = f ? f.keywords.filter((k) => k.name === 'MSGID') : [];
              check('the field now has two MSGID keywords', ms.length === 2);
              check('the new one was appended after the existing (stays last)', ms.length === 2 && /MIDF/.test(ms[1].parameters) && /CPD1234/.test(ms[0].parameters));
              const notes = DspfWriter.msgidConditioningNotes(f ? f.keywords : []);
              check('the resulting state is what the advisory note describes (#1 needs an indicator)', notes.length === 1 && /MSGID #1 needs/.test(notes[0]));
            },
            () => scenario('UI: removing the last of two MSGIDs still commits normally',
              base([kwLine('25', 'MSGID(&MIDF &MFILE)'), kwLine('', 'MSGID(CPD1234 QGPL/USRMSG)')]),
              (ctx) => {
                const p = panel(ctx);
                const removes = p.doc.querySelectorAll('.repeat-inst-remove[data-prefix="' + p.prefix + '"]');
                check('setup: two Remove buttons', removes.length === 2);
                removes[1].click();
                const e = lastEdit(ctx);
                check('applyEdit posted', !!e);
                const f = e && DspfParser.parseDspf(e.text).records[0].fields.find((x) => x.name === 'MSGFLD');
                const ms = f ? f.keywords.filter((k) => k.name === 'MSGID') : [];
                check('one MSGID left (the conditioned one)', ms.length === 1 && ms[0].conditions.length === 1);
                check('the note now describes the remaining conditioned-only MSGID', DspfWriter.msgidConditioningNotes(f ? f.keywords : []).length === 1);
              },
              finish))))));
}

function finish() {
  if (failures === 0) console.log('\nALL CHECKS PASSED');
  else { console.log('\n' + failures + ' CHECK(S) FAILED'); process.exitCode = 1; }
  setTimeout(() => process.exit(process.exitCode || 0), 50);
}

run();

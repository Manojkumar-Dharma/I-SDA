/**
 * i158MnubardspAmpersand.test.js
 *
 * Task I-158 - the DDS Reference writes MNUBARDSP as
 *   MNUBARDSP(menu-bar-record &choice-field [&pull-down-input])
 * (and every one of its examples writes the &), but the Menu-Bar display rows
 * wrote the bare names. The panel now writes the & on the choice field and the
 * pull-down input (and on a MNUBAR record's pull-down input); the menu-bar
 * record name stays bare; the inputs show the bare name and accept a name
 * typed with or without the &; a hand-written bare-name MNUBARDSP displays the
 * same and is rewritten to the & form only when its own row is edited.
 * The compiler requires the & (confirmed against the IBM i document), so the
 * I-152 guard also refuses ADDING a bare field name through the raw editor.
 *
 * Run with: node src/test/i158MnubardspAmpersand.test.js
 */
'use strict';
const path = require('path');
const DspfParser = require(path.join(__dirname, '../../dist/dspfParser.js'));
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const { check, failureCount } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');

const SOURCE = [
  '     A          R BARSCR                     MNUBARDSP(BAR1 CHC PDI)',
  '     A            CHC            2Y 0H',
  '     A            PDI            2S 0H',
  '     A          R AMPSCR                     MNUBARDSP(BAR1 &CHC2 &PDI2)',
  '     A            CHC2           2Y 0H',
  '     A            PDI2           2S 0H',
  '     A            CHC3           2Y 0H',
  '     A          R FRESH',
  '     A            CHC4           2Y 0H',
  '     A          R BAR1                       MNUBAR',
  '     A            MNUFLD         2Y 0B 3  2',
  "     A                                      MNUBARCHC(1 PULLFILE '>File')",
].join('\n') + '\n';

const html = webviewHtml('vscode-webview://fake', 'testnonce', SOURCE, 'MYSCR.DSPF');
const posted = [];
const dom = newWebviewDom(html, {
  beforeParse(window) {
    window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
    window.alert = () => {};
  },
});

setTimeout(() => {
  const { document: doc, Event } = dom.window;
  const edits = () => posted.filter((m) => m.type === 'applyEdit');
  const rec = (name) => DspfParser.parseDspf(edits().pop().text).records.find((r) => r.name === name);
  const select = (name) => { const s = doc.getElementById('recordSelect'); s.value = name; s.dispatchEvent(new Event('change', { bubbles: true })); };
  const setValue = (el, v) => { el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); };
  const dsp = (r) => r.keywords.find((k) => k.name === 'MNUBARDSP').parameters.trim();
  function rawAdd(record, name, params) {
    const owner = 'record-' + record;
    doc.getElementById(owner + '-new-kw-name').value = name;
    const p = doc.getElementById(owner + '-new-kw-params'); if (p) p.value = params || '';
    posted.length = 0;
    let msg = null;
    const orig = dom.window.alert; dom.window.alert = (m) => { msg = m; };
    doc.querySelector('.kw-add[data-owner="' + owner + '"]').dispatchEvent(new Event('click', { bubbles: true }));
    dom.window.alert = orig;
    return msg;
  }

  console.log('=== opening a file rewrites nothing ===');
  check('no edit was posted while loading the file (bare and & forms alike)', edits().length === 0);

  console.log('\n=== a hand-written BARE-name MNUBARDSP ===');
  select('BARSCR');
  const p1 = 'rk-BARSCR-mnubardsp-rep-inst0';
  check('displays the bare names', doc.querySelector('.' + p1 + '-rec').value === 'BAR1' && doc.querySelector('.' + p1 + '-chc').value === 'CHC' && doc.querySelector('.' + p1 + '-pull').value === 'PDI');
  check('selecting the record posts no edit', edits().length === 0);
  setValue(doc.querySelector('.' + p1 + '-pull'), '');
  check('editing the row rewrites it in the reference form (& on the choice field), trailing blank dropped', dsp(rec('BARSCR')) === 'BAR1 &CHC');
  check('the menu-bar record name stays bare', !/&BAR1/.test(dsp(rec('BARSCR'))));

  console.log('\n=== a hand-written & MNUBARDSP ===');
  select('AMPSCR');
  const p2 = 'rk-AMPSCR-mnubardsp-rep-inst0';
  check('displays the names WITHOUT the &', doc.querySelector('.' + p2 + '-chc').value === 'CHC2' && doc.querySelector('.' + p2 + '-pull').value === 'PDI2');
  posted.length = 0;
  setValue(doc.querySelector('.' + p2 + '-chc'), 'CHC3');
  check('editing the choice field keeps the & on both (no doubling, no loss)', dsp(rec('AMPSCR')) === 'BAR1 &CHC3 &PDI2');

  console.log('\n=== typed with or without the & ===');
  setTimeout(() => {
    setValue(doc.querySelector('.' + p2 + '-chc'), '&CHC2');
    check('typed WITH the &: written once', dsp(rec('AMPSCR')) === 'BAR1 &CHC2 &PDI2');
    setTimeout(() => {
      setValue(doc.querySelector('.' + p2 + '-chc'), '  CHC3  ');
      check('typed bare with stray blanks: trimmed and written once', dsp(rec('AMPSCR')) === 'BAR1 &CHC3 &PDI2');
      setTimeout(() => {
        setValue(doc.querySelector('.' + p2 + '-chc'), '&&CHC2');
        check('a doubled & is collapsed to one', dsp(rec('AMPSCR')) === 'BAR1 &CHC2 &PDI2');
        setTimeout(() => {
          setValue(doc.querySelector('.' + p2 + '-pull'), '');
          check('clearing the pull-down input drops it (no stray &)', dsp(rec('AMPSCR')) === 'BAR1 &CHC2');

          console.log('\n=== the MNUBAR record ===');
          select('BAR1');
          const bar = 'rk-BAR1-mnubardsp-rep';
          doc.querySelector('.repeat-inst-add[data-prefix="' + bar + '"]').dispatchEvent(new Event('click', { bubbles: true }));
          setTimeout(() => {
            check('a new instance on a MNUBAR record starts blank (bare MNUBARDSP is valid there)', dsp(rec('BAR1')) === '');
            // The writer is the single place the parameter text is parsed back.
            check('an unchanged hand-written bare file is not refused (only an edit that adds a bare name is)',
              DspfWriter.windowHelpMenuNewConflictReason(DspfParser.parseDspf(SOURCE), DspfParser.parseDspf(SOURCE)) === null);

            console.log('\n=== the raw keyword editor: the compiler requires the & ===');
            select('FRESH');
            let msg = rawAdd('FRESH', 'MNUBARDSP', 'BAR1 CHC4');
            check('raw-adding MNUBARDSP(BAR1 CHC4) is refused, naming the & form', /MNUBARDSP field CHC4 on record format FRESH must be written &CHC4/.test(msg || '') && edits().length === 0);
            msg = rawAdd('FRESH', 'MNUBARDSP', 'BAR1 &CHC4');
            check('raw-adding MNUBARDSP(BAR1 &CHC4) goes through', msg === null && edits().length === 1 && dsp(rec('FRESH')) === 'BAR1 &CHC4');
            console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : failureCount() + ' CHECK(S) FAILED'));
            process.exit(failureCount() === 0 ? 0 : 1);
          }, 50);
        }, 50);
      }, 50);
    }, 50);
  }, 50);
}, 400);

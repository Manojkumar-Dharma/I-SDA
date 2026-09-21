/**
 * i98SflmsgGeneralConditioning.test.js
 *
 * Task I-98 - the SFLMSG record's General panel (sflMsgPanelsHtml/
 * wireSflMsgPanels) must not offer an option-indicator Conditioning toggle
 * on LOGINP. IBM's DDS Reference says "Option indicators are not valid for
 * this keyword" for LOGINP. The SFL panel has honoured that since I-9; I-11
 * checked SFLMSG's keyword set against I-9's but never its conditioning, so
 * the toggle was left in.
 *
 * Task I-117 later dropped this panel's own CHECK(AB)/CHECK(RL)/CHGINPDFT
 * rows (and the Indicator panel's INDTXT/SETOF/CHANGE rows) entirely - the
 * DDS Reference's SFL section puts all of them only on its "for all other
 * subfiles" list, never the message-subfile one, and unlike LOGINP/LOGOUT
 * none of them has an individually-documented "ignored on a message
 * subfile" fallback to justify keeping an advisory-only row. This file's
 * former CHECK(AB)/CHECK(RL)/CHGINPDFT conditioning checks are replaced
 * below with checks that those rows (and the Indicator panel) no longer
 * render at all - see i115SflmsgKeywordsTab.test.js and dspfWebview.test.js
 * for the rest of I-117's coverage.
 *
 * Runs the DSPF designer's real generated client-side script in jsdom (same
 * rationale as i9SflConditioningAudit.test.js).
 * Run with: node src/test/i98SflmsgGeneralConditioning.test.js
 */
const { JSDOM } = require('jsdom');
const { getWebviewHtml } = require('../../dist/webviewTemplate.js');
const DspfParser = require('../../dist/dspfParser.js');
const { buildLine } = require('../fixtures/lineBuilder');

let failures = 0;
function check(label, condition) {
  if (condition) {
    console.log('  ok  -', label);
  } else {
    failures++;
    console.log('FAIL  -', label);
  }
}

/** Boots the designer on `src`, selects SFLMESS and opens its SFLMSG tab. */
function boot(src, done) {
  const html = getWebviewHtml('vscode-webview://fake', 'testnonce98', src, 'SFLMSG98.DSPF').replace(
    /<meta http-equiv="Content-Security-Policy"[^>]*>/,
    ''
  );
  const posted = [];
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
      window.alert = () => {};
    },
  });
  setTimeout(() => {
    const doc = dom.window.document;
    const { Event } = dom.window;
    const recordSelect = doc.getElementById('recordSelect');
    recordSelect.value = 'SFLMESS';
    recordSelect.dispatchEvent(new Event('change', { bubbles: true }));
    const tab = Array.from(doc.querySelectorAll('.props-tab')).find((b) => b.textContent.trim() === 'SFLMSG');
    if (tab) tab.dispatchEvent(new Event('click', { bubbles: true }));
    done({ doc, Event, posted, dom });
  }, 0);
}

function sflMsgLines(extra) {
  return [
    buildLine({ seq: '00010', nameType: 'R', name: 'SFLMESS', func: 'SFL' }),
    buildLine({ seq: '00020', func: 'SFLMSGRCD(24)' }),
  ]
    .concat(extra || [])
    .concat([
      buildLine({ seq: '00030', name: 'MSGKEY', dataType: 'A', length: '10', usage: 'H' }),
      buildLine({ seq: '00040', func: 'SFLMSGKEY' }),
      buildLine({ seq: '00050', name: 'PGMQ', dataType: 'A', length: '10', usage: 'H' }),
      buildLine({ seq: '00060', func: 'SFLPGMQ(276)' }),
    ])
    .join('\n') + '\n';
}

function lastRecord(posted) {
  const applyEdit = posted.filter((m) => m.type === 'applyEdit').pop();
  if (!applyEdit) return null;
  return DspfParser.parseDspf(applyEdit.text).records.find((r) => r.name === 'SFLMESS');
}

// ---------------------------------------------------------------------------
// Scenario 1 - plain SFLMSG record: which rows offer a Conditioning toggle,
// and which rows I-117 dropped entirely.
// ---------------------------------------------------------------------------
boot(sflMsgLines(), ({ doc, Event, posted }) => {
  const hasToggle = (id) => !!doc.querySelector('.kw-cond-toggle[data-flag-id="' + id + '"]');

  console.log('\nsetup');
  check('the SFLMSG tab rendered its General rows', !!doc.getElementById('sm-sflnxtchg-on') && !!doc.getElementById('sm-loginp-on'));

  console.log('\nTask I-98: LOGINP must not offer a Conditioning toggle');
  check('sm-loginp has no Conditioning toggle', !hasToggle('sm-loginp'));

  console.log('\nno regression: the rows that DO take option indicators keep their toggle');
  ['sm-sflnxtchg', 'sm-logout'].forEach((id) => {
    check(id + ' still has a Conditioning toggle', hasToggle(id));
  });

  console.log('\nTask I-117: CHECK(AB)/CHECK(RL)/CHGINPDFT rows are dropped from the General panel entirely - not just conditioning-less, gone');
  check('no sm-check-ab row', !doc.getElementById('sm-check-ab-on'));
  check('no sm-check-rl row', !doc.getElementById('sm-check-rl-on'));
  check('no sm-chginpdft row', !doc.getElementById('sm-chginpdft-on'));

  console.log('\nTask I-117: INDTXT/SETOF/CHANGE rows are dropped from the Indicator panel entirely');
  check('no sm-ind rows', !doc.getElementById('sm-ind-row0-kw'));
  check('hint explains why', /a message-subfile record accepts only SFLMSGRCD, so INDTXT\/SETOF\/CHANGE are not offered here/.test(doc.body.innerHTML));

  console.log('\nthe rows still work as plain on/off checkboxes');
  const on = (id) => {
    const el = doc.getElementById(id + '-on');
    el.checked = true;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  posted.length = 0;
  on('sm-loginp');
  let rec = lastRecord(posted);
  check('LOGINP turned on commits an edit', !!rec && rec.keywords.some((k) => k.name === 'LOGINP'));
  check('the committed LOGINP carries no indicators', !!rec && rec.keywords.filter((k) => k.name === 'LOGINP').every((k) => !(k.conditions || []).length));

  // -------------------------------------------------------------------------
  // Scenario 2 - hand-edited record that already carries an indicator on
  // LOGINP: not shown, but nothing else on the panel may silently drop it
  // (same preserve-existing-conditioning behaviour as the SFL panel).
  // -------------------------------------------------------------------------
  boot(
    sflMsgLines([
      buildLine({ seq: '00025', ind1: '50', func: 'LOGINP' }),
    ]),
    ({ doc: doc2, Event: Event2, posted: posted2 }) => {
      console.log('\nhand-edited record already carrying LOGINP with an indicator');
      const rec0 = DspfParser.parseDspf(sflMsgLines([
        buildLine({ seq: '00025', ind1: '50', func: 'LOGINP' }),
      ])).records.find((r) => r.name === 'SFLMESS');
      check('setup: the parser sees LOGINP with an indicator condition', rec0.keywords.filter((k) => k.name === 'LOGINP' && (k.conditions || []).length > 0).length === 1);
      check('setup: LOGINP box renders checked', doc2.getElementById('sm-loginp-on').checked);
      check('still no Conditioning toggle on LOGINP', !doc2.querySelector('.kw-cond-toggle[data-flag-id="sm-loginp"]'));

      const logout = doc2.getElementById('sm-logout-on');
      logout.checked = true;
      logout.dispatchEvent(new Event2('change', { bubbles: true }));
      const rec1 = lastRecord(posted2);
      check('editing another row (LOGOUT) posted an edit', !!rec1 && rec1.keywords.some((k) => k.name === 'LOGOUT'));
      check("LOGINP's existing indicator survived the edit", !!rec1 && rec1.keywords.some((k) => k.name === 'LOGINP' && (k.conditions || []).length > 0));

      posted2.length = 0;
      const loginp = doc2.getElementById('sm-loginp-on');
      loginp.checked = false;
      loginp.dispatchEvent(new Event2('change', { bubbles: true }));
      const rec2 = lastRecord(posted2);
      check('unticking LOGINP removes it (removal is never blocked)', !!rec2 && !rec2.keywords.some((k) => k.name === 'LOGINP'));

      console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
      process.exit(failures === 0 ? 0 : 1);
    }
  );
});

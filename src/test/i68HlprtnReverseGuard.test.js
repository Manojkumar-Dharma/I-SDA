/**
 * i68HlprtnReverseGuard.test.js
 *
 * Task I-68 - reverse direction of I-38's HLPDOC/HLPRTN mutual exclusion.
 * IBM: "You cannot specify HLPDOC with HLPBDY, HLPPNLGRP, or HLPRTN."
 * I-38 blocked HLPDOC turning on while HLPRTN was present, and blocked
 * HLPPNLGRP turning on while HLPDOC was present - but HLPRTN's own file-
 * level row goes through the shared `commitIndicatorTextRow` helper, which
 * had no per-keyword conflict hook, so ticking HLPRTN while HLPDOC was
 * already there was silently accepted.
 *
 * Runs the DSPF designer's real generated client-side script in jsdom (the
 * same approach i38HlpdocFileLevel.test.js takes). Also checks the things
 * the guard must NOT do: block editing an already-present HLPRTN (a
 * hand-edited file carrying both), block turning it off, or block the
 * pairings IBM only ranks by priority rather than forbids (HLPRCD,
 * HLPPNLGRP), or touch its neighbours in the same row group.
 * Run with: node src/test/i68HlprtnReverseGuard.test.js
 */
const { JSDOM } = require('jsdom');
const { getWebviewHtml } = require('../../dist/webviewTemplate.js');
const DspfWriter = require('../../dist/dspfWriter.js');

let failures = 0;
function check(label, condition) {
  if (condition) {
    console.log('  ok  -', label);
  } else {
    failures++;
    console.log('FAIL  -', label);
  }
}

const KW = (text) => '     A                                      ' + text;
const HLPDOC = KW('HLPDOC(START GENERAL.HLP HELP.F1)');

function sourceOf(fileKeywords) {
  return ['     A                                      DSPSIZ(24 80 *DS3)']
    .concat(fileKeywords)
    .concat(['     A          R SCR1', "     A                                  1  2'MAIN SCREEN'"])
    .join('\n') + '\n';
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function scenario(fileKeywords, fn) {
  const html = getWebviewHtml('vscode-webview://fake', 'testnonce', sourceOf(fileKeywords), 'MYSCR.DSPF').replace(
    /<meta http-equiv="Content-Security-Policy"[^>]*>/,
    ''
  );
  const posted = [];
  const alerts = [];
  const errors = [];
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
      window.alert = (m) => alerts.push(m);
      window.addEventListener('error', (e) => errors.push(e.error || e.message));
    },
  });
  await sleep(450);
  const doc = dom.window.document;
  const Ev = dom.window.Event;
  const ctx = {
    doc,
    posted,
    alerts,
    fire: (el, type) => el.dispatchEvent(new Ev(type || 'change', { bubbles: true })),
    lastEdit: () => posted.filter((m) => m.type === 'applyEdit').pop() || null,
    reset: () => { posted.length = 0; alerts.length = 0; },
  };
  doc.getElementById('crumb-file').dispatchEvent(new Ev('click', { bubbles: true }));
  // fk-hlprtn's row lives on one of the File Properties tabs - visit each
  // until it renders (every tab's HTML is in the DOM once selected).
  const tabs = Array.from(doc.querySelectorAll('.props-tab'));
  for (const t of tabs) {
    t.dispatchEvent(new Ev('click', { bubbles: true }));
    if (doc.getElementById('fk-hlprtn-on')) break;
  }
  await fn(ctx);
  check('no uncaught errors in this scenario', errors.length === 0);
  dom.window.close();
}

async function main() {
  console.log('Unit: the shared conflict function already answers the reverse question');
  {
    const r = DspfWriter.hlpdocConflictReason('HLPRTN', [{ name: 'HLPDOC', parameters: 'A B C', conditions: [] }]);
    check('hlpdocConflictReason(HLPRTN, [HLPDOC]) names both keywords', /HLPRTN/.test(r) && /HLPDOC/.test(r));
    check('...and is empty when HLPDOC is absent', DspfWriter.hlpdocConflictReason('HLPRTN', []) === '');
  }

  console.log('\n1. HLPDOC already present: ticking HLPRTN is blocked');
  await scenario([HLPDOC], async (c) => {
    const on = c.doc.getElementById('fk-hlprtn-on');
    check('setup: the HLPRTN checkbox is rendered, unchecked', !!on && on.checked === false);
    c.reset();
    on.checked = true;
    c.fire(on);
    check('an alert named both keywords', c.alerts.length === 1 && /HLPRTN/.test(c.alerts[0]) && /HLPDOC/.test(c.alerts[0]));
    check('the checkbox reverted to unchecked', on.checked === false);
    check('no edit was posted', c.lastEdit() === null);

    c.reset();
    const ind = c.doc.getElementById('fk-hlprtn-ind');
    ind.value = '70';
    c.fire(ind);
    check('typing a response indicator while the box is still unchecked does not alert and never writes HLPRTN', c.alerts.length === 0 && (c.lastEdit() === null || !/HLPRTN/.test(c.lastEdit().text)));
    c.reset();
    on.checked = true;
    c.fire(on);
    check('...and ticking it afterwards is still blocked', c.alerts.length === 1 && on.checked === false && c.lastEdit() === null);
  });

  console.log('\n2. The neighbours in the same row group are unaffected (HLPDOC present)');
  await scenario([HLPDOC], async (c) => {
    for (const [id, name] of [['fk-clear', 'CLEAR'], ['fk-home', 'HOME'], ['fk-pagedown', 'PAGEDOWN'], ['fk-pageup', 'PAGEUP'], ['fk-vldcmdkey', 'VLDCMDKEY']]) {
      const on = c.doc.getElementById(id + '-on');
      c.reset();
      on.checked = true;
      c.fire(on);
      const e = c.lastEdit();
      check(name + ' still ticks on with no alert and is written', !!on && c.alerts.length === 0 && !!e && new RegExp(name).test(e.text));
      on.checked = false;
      c.fire(on);
    }
  });

  console.log('\n3. A hand-edited file that ALREADY carries both stays editable');
  await scenario([HLPDOC, KW('HLPRTN(70)')], async (c) => {
    const on = c.doc.getElementById('fk-hlprtn-on');
    const ind = c.doc.getElementById('fk-hlprtn-ind');
    check('setup: HLPRTN renders checked with its indicator', on.checked === true && ind.value === '70');
    c.reset();
    ind.value = '71';
    c.fire(ind);
    const e = c.lastEdit();
    check('changing its response indicator is not blocked (only the off->on transition is checked)', c.alerts.length === 0 && !!e && /HLPRTN\(71\)/.test(e.text));
    c.reset();
    on.checked = false;
    c.fire(on);
    const off = c.lastEdit();
    check('turning it off is never blocked and removes it', c.alerts.length === 0 && !!off && !/HLPRTN/.test(off.text));
    check('HLPDOC is untouched by that edit', !!off && /HLPDOC\(START GENERAL\.HLP HELP\.F1\)/.test(off.text));
  });

  console.log('\n4. No HLPDOC: HLPRTN works exactly as before');
  await scenario([], async (c) => {
    const on = c.doc.getElementById('fk-hlprtn-on');
    const ind = c.doc.getElementById('fk-hlprtn-ind');
    const txt = c.doc.getElementById('fk-hlprtn-text');
    ind.value = '70';
    c.fire(ind);
    txt.value = 'Help returned';
    c.fire(txt);
    c.reset();
    on.checked = true;
    c.fire(on);
    const e = c.lastEdit();
    check('ticking HLPRTN with an indicator and text writes it, no alert', c.alerts.length === 0 && !!e && /HLPRTN\(70 'Help returned'\)/.test(e.text));
  });

  console.log('\n5. Pairings IBM only ranks by priority are NOT blocked');
  await scenario([KW('HLPRCD(GENERAL)')], async (c) => {
    const on = c.doc.getElementById('fk-hlprtn-on');
    c.reset();
    on.checked = true;
    c.fire(on);
    check('HLPRTN with HLPRCD present is allowed ("takes priority over", not a prohibition)', c.alerts.length === 0 && !!c.lastEdit() && /HLPRTN/.test(c.lastEdit().text) && /HLPRCD\(GENERAL\)/.test(c.lastEdit().text));
  });
  await scenario([KW('HLPPNLGRP(MOD1 PG1)')], async (c) => {
    const on = c.doc.getElementById('fk-hlprtn-on');
    c.reset();
    on.checked = true;
    c.fire(on);
    check('HLPRTN with HLPPNLGRP present is allowed (only HLPDOC forbids HLPRTN)', c.alerts.length === 0 && !!c.lastEdit() && /HLPRTN/.test(c.lastEdit().text));
  });

  console.log('\n6. Forward direction (I-38) still works: HLPDOC blocked while HLPRTN present');
  await scenario([KW('HLPRTN')], async (c) => {
    const on = c.doc.getElementById('fk-hlpdoc-on');
    if (!on) {
      // HLPDOC lives on a different tab than HLPRTN - find it.
      for (const t of Array.from(c.doc.querySelectorAll('.props-tab'))) {
        t.dispatchEvent(new c.doc.defaultView.Event('click', { bubbles: true }));
        if (c.doc.getElementById('fk-hlpdoc-on')) break;
      }
    }
    const hd = c.doc.getElementById('fk-hlpdoc-on');
    check('setup: HLPDOC checkbox rendered', !!hd);
    for (const [id, v] of [['fk-hlpdoc-label', 'START'], ['fk-hlpdoc-document', 'GENERAL.HLP'], ['fk-hlpdoc-folder', 'HELP.F1']]) {
      c.doc.getElementById(id).value = v;
      c.fire(c.doc.getElementById(id));
    }
    c.reset();
    hd.checked = true;
    c.fire(hd);
    check('blocked with an alert naming HLPRTN, reverted, nothing posted', c.alerts.length === 1 && /HLPRTN/.test(c.alerts[0]) && hd.checked === false && c.lastEdit() === null);
  });

  console.log(failures === 0 ? '\nALL CHECKS PASSED' : '\n' + failures + ' CHECK(S) FAILED');
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });

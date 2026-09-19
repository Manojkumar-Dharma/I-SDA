/**
 * i83HtmlConstantAttributesGate.test.js
 *
 * Task I-83 - follow-up from I-41. HTML's own DDS Reference says COLOR,
 * DATE, DFT, DSPATR, EDTCDE, EDTWRD, HLPID, MSGCON, NOCCSID, OVRATR,
 * PUTRETAIN, SYSNAME, TIME and USER are not allowed with it on the same
 * field. I-41 guarded the field-level raw keyword editor, but the
 * Attributes tab's structured editors were left ungated:
 *   - Color & attributes (COLOR / DSPATR)        wireColorAttrStatesEditor
 *   - General keywords (DFT, HLPID, PUTRETAIN,   wireGeneralFieldKeywordsEditor
 *     OVRATR, NOCCSID - all reachable on a constant)
 * so each of those could still be added to an HTML constant, writing
 * invalid DDS. (I-83's own row only named DSPATR/COLOR; probing the real
 * panel showed the General keywords rows had the identical gap, so both
 * are fixed here.)
 *
 * Fix: a shared, optional on-transition guard (withAddGuard) on both
 * editors, fed by DspfWriter.htmlConflictReason. Only NEWLY added
 * keyword names are checked; removals and edits to keywords already
 * present are never blocked.
 *
 * Runs the DSPF designer's real generated client-side script in jsdom.
 * Run with: node src/test/i83HtmlConstantAttributesGate.test.js
 */
const { JSDOM } = require('jsdom');
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

const KW = '     A' + ' '.repeat(38);

function makeDom(lines) {
  const src = lines.join('\n') + '\n';
  const html = getWebviewHtml('vscode-webview://fake', 'testnonce', src, 'HTML.DSPF').replace(
    /<meta http-equiv="Content-Security-Policy"[^>]*>/,
    ''
  );
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

function selectField(ctx, index) {
  ctx.dom.window.document.querySelectorAll('.dspf-field')[index].click();
  ctx.posted.length = 0;
  ctx.alerts.length = 0;
}

function lastEdit(ctx) {
  return ctx.posted.filter((m) => m.type === 'applyEdit').pop();
}

function fire(ctx, el) {
  el.dispatchEvent(new ctx.dom.window.Event('change', { bubbles: true }));
}

function reparsedField(edit, pred) {
  const rec = DspfParser.parseDspf(edit.text).records.find((r) => r.name === 'RECORD1');
  return rec.fields.find(pred);
}

// ---------------------------------------------------------------------------
// Scenario 1: HTML constant - every excluded keyword the tab can add is blocked
// ---------------------------------------------------------------------------
setTimeout(() => {
  const ctx = makeDom(['     A          R RECORD1', "     A                                  1 10HTML('<TITLE>')", "     A                                  2  2'Hello'"]);
  setTimeout(() => {
    const doc = ctx.dom.window.document;

    console.log('HTML constant: General keywords rows on HTML\'s exclusion list are blocked');
    [['putretain', 'PUTRETAIN', null], ['ovratr', 'OVRATR', null], ['noccsid', 'NOCCSID', null], ['hlpid', 'HLPID', "'H1'"], ['dft', 'DFT', "'X'"]].forEach(([key, name, params]) => {
      selectField(ctx, 0);
      const on = doc.getElementById('field-2-gen-' + key + '-on');
      check('setup: ' + name + ' checkbox present on an HTML constant', !!on);
      if (!on) return;
      if (params) doc.getElementById('field-2-gen-' + key + '-params').value = params;
      on.checked = true;
      fire(ctx, on);
      check(name + ': alert names ' + name + ' and HTML', ctx.alerts.length === 1 && ctx.alerts[0].indexOf(name) !== -1 && ctx.alerts[0].indexOf('HTML') !== -1);
      check(name + ': no applyEdit posted', !lastEdit(ctx));
    });

    console.log('\nHTML constant: Color & attributes - COLOR is blocked');
    selectField(ctx, 0);
    doc.getElementById('field-2-colorattr-new-color').value = 'RED';
    const addBtn = Array.from(doc.querySelectorAll('button')).find((b) => /Add color\/attribute state/.test(b.textContent));
    check('setup: "+ Add color/attribute state" button present', !!addBtn);
    addBtn.click();
    check('COLOR: alert names COLOR and HTML', ctx.alerts.length === 1 && ctx.alerts[0].indexOf('COLOR') !== -1 && ctx.alerts[0].indexOf('HTML') !== -1);
    check('COLOR: no applyEdit posted', !lastEdit(ctx));

    console.log('\nHTML constant: Color & attributes - DSPATR (attribute checkbox only) is blocked');
    selectField(ctx, 0);
    const attr = doc.querySelector('.field-2-colorattr-new-attr');
    check('setup: a DSPATR attribute checkbox is present', !!attr);
    attr.checked = true;
    const addBtn2 = Array.from(doc.querySelectorAll('button')).find((b) => /Add color\/attribute state/.test(b.textContent));
    addBtn2.click();
    check('DSPATR: alert names DSPATR and HTML', ctx.alerts.length === 1 && ctx.alerts[0].indexOf('DSPATR') !== -1 && ctx.alerts[0].indexOf('HTML') !== -1);
    check('DSPATR: no applyEdit posted', !lastEdit(ctx));

    console.log('\nHTML constant: allowed keywords still commit (TEXT is not on the exclusion list)');
    selectField(ctx, 0);
    const textOn = doc.getElementById('field-2-gen-text-on');
    doc.getElementById('field-2-gen-text-params').value = "'documentation'";
    textOn.checked = true;
    fire(ctx, textOn);
    check('TEXT: no alert', ctx.alerts.length === 0);
    const e = lastEdit(ctx);
    check('TEXT: applyEdit posted', !!e);
    const f = e && reparsedField(e, (fld) => fld.keywords.some((k) => k.name === 'HTML'));
    check('TEXT: written next to HTML, HTML preserved', !!f && f.keywords.some((k) => k.name === 'TEXT') && f.keywords.some((k) => k.name === 'HTML'));

    check('no uncaught errors in scenario 1', ctx.errors.length === 0);
    scenario2();
  }, 500);
}, 0);

// ---------------------------------------------------------------------------
// Scenario 2: hand-edited HTML constant that ALREADY has COLOR / PUTRETAIN -
// removal is never blocked
// ---------------------------------------------------------------------------
function scenario2() {
  const ctx = makeDom([
    '     A          R RECORD1',
    "     A                                  1 10HTML('<TITLE>')",
    KW + 'COLOR(RED)',
    KW + 'PUTRETAIN',
    "     A                                  2  2'Hello'",
  ]);
  setTimeout(() => {
    const doc = ctx.dom.window.document;

    console.log('\nHand-edited HTML constant with PUTRETAIN already present: turning it OFF is not blocked');
    selectField(ctx, 0);
    const on = doc.getElementById('field-2-gen-putretain-on');
    check('setup: PUTRETAIN checkbox rendered checked', !!on && on.checked === true);
    on.checked = false;
    fire(ctx, on);
    check('no alert fired when removing PUTRETAIN', ctx.alerts.length === 0);
    const e = lastEdit(ctx);
    check('applyEdit posted', !!e);
    const f = e && reparsedField(e, (fld) => fld.keywords.some((k) => k.name === 'HTML'));
    check('PUTRETAIN removed, HTML and COLOR untouched', !!f && !f.keywords.some((k) => k.name === 'PUTRETAIN') && f.keywords.some((k) => k.name === 'HTML') && f.keywords.some((k) => k.name === 'COLOR'));

    console.log('\nHand-edited HTML constant with COLOR already present: clearing the colour is not blocked');
    selectField(ctx, 0);
    const colorSel = doc.getElementById('field-2-colorattr-inst0-color');
    check('setup: existing COLOR state rendered with RED', !!colorSel && colorSel.value === 'RED');
    colorSel.value = '';
    fire(ctx, colorSel);
    check('no alert fired when clearing COLOR', ctx.alerts.length === 0);
    const e2 = lastEdit(ctx);
    check('applyEdit posted', !!e2);
    const f2 = e2 && reparsedField(e2, (fld) => fld.keywords.some((k) => k.name === 'HTML'));
    check('COLOR removed, HTML still present', !!f2 && !f2.keywords.some((k) => k.name === 'COLOR') && f2.keywords.some((k) => k.name === 'HTML'));

    check('no uncaught errors in scenario 2', ctx.errors.length === 0);
    scenario3();
  }, 500);
}

// ---------------------------------------------------------------------------
// Scenario 3: no regression - a plain literal constant and a named field are
// unaffected
// ---------------------------------------------------------------------------
function scenario3() {
  const ctx = makeDom([
    '     A          R RECORD1',
    "     A                                  1 10'PLAIN'",
    '     A            FLD1          5A  B  2  2',
  ]);
  setTimeout(() => {
    const doc = ctx.dom.window.document;

    console.log('\nplain literal constant: PUTRETAIN and COLOR still commit normally');
    selectField(ctx, 0);
    const put = doc.getElementById('field-2-gen-putretain-on');
    check('setup: PUTRETAIN checkbox present on a plain constant', !!put);
    put.checked = true;
    fire(ctx, put);
    check('PUTRETAIN: no alert on a plain constant', ctx.alerts.length === 0);
    const e = lastEdit(ctx);
    check('PUTRETAIN: applyEdit posted with PUTRETAIN', !!e && /PUTRETAIN/.test(e.text));

    selectField(ctx, 0);
    doc.getElementById('field-2-colorattr-new-color').value = 'RED';
    Array.from(doc.querySelectorAll('button')).find((b) => /Add color\/attribute state/.test(b.textContent)).click();
    check('COLOR: no alert on a plain constant', ctx.alerts.length === 0);
    const e2 = lastEdit(ctx);
    check('COLOR: applyEdit posted with COLOR(RED)', !!e2 && /COLOR\(RED\)/.test(e2.text));

    console.log('\nnamed field: COLOR still commits normally');
    selectField(ctx, 1);
    const colorNew = doc.querySelector('[id^="field-"][id$="-colorattr-new-color"]');
    check('setup: colour picker present on a named field', !!colorNew);
    if (colorNew) {
      colorNew.value = 'BLU';
      Array.from(doc.querySelectorAll('button')).find((b) => /Add color\/attribute state/.test(b.textContent)).click();
      check('COLOR: no alert on a named field', ctx.alerts.length === 0);
      const e3 = lastEdit(ctx);
      check('COLOR: applyEdit posted with COLOR(BLU)', !!e3 && /COLOR\(BLU\)/.test(e3.text));
    }

    check('no uncaught errors in scenario 3', ctx.errors.length === 0);
    finish();
  }, 500);
}

function finish() {
  if (failures === 0) {
    console.log('\nALL CHECKS PASSED');
  } else {
    console.log('\n' + failures + ' CHECK(S) FAILED');
    process.exitCode = 1;
  }
  setTimeout(() => process.exit(process.exitCode || 0), 50);
}

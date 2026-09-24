/**
 * i57PshbtnFieldKind.test.js
 *
 * Task I-57 - PSHBTNFLD / PSHBTNCHC (push-button field), split off from
 * I-41. Covers, in order:
 *   A. DspfWriter's model: PSHBTNCHC parse/compose (IBM's own examples),
 *      PSHBTNFLD's `(*NUMCOL n)`-style grammar, the ten-keyword whitelist
 *      guard (both directions + PSHBTNCHC-needs-PSHBTNFLD), and the
 *      Y / length 2 / decimals 0 / input-capable definition rule.
 *   B. DspfEngine's design-time preview: the previous parser treated
 *      PSHBTNCHC as "just the button text" and rendered each button as its
 *      raw parameter string; now every choice becomes its own button, with
 *      mnemonics stripped, option-indicator compression, and the
 *      *NUMCOL/*NUMROW/*GUTTER/*SPACEB layout.
 *   C. The real generated webview: the "Push button field" accordion, the
 *      on/off toggle (which also normalizes the field's definition in the
 *      SAME edit), params Apply validation, the choices editor (add /
 *      duplicate-number guard / command key / *SPACEB / remove), the raw
 *      keyword editor guard, the SNGCHCFLD guard, and the new "Push button"
 *      field kind in the add-field panel.
 * Run with: node src/test/i57PshbtnFieldKind.test.js
 */
const path = require('path');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const DspfEngine = require(path.join(__dirname, '../dspfEngine.js'));
const DspfParser = require(path.join(__dirname, '../../dist/dspfParser.js'));
const { buildLine } = require('../fixtures/lineBuilder');

const { check, failureCount } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');
const kwd = (name, parameters) => ({ name, parameters: parameters || '', conditions: [], raw: '', sourceLines: [] });

// ===========================================================================
// A. DspfWriter model
// ===========================================================================
console.log('A1. PSHBTNCHC parse/compose - IBM\'s own examples');
{
  const p = DspfWriter.parsePshbtnchcParams;
  const help = p("1 '>Help' HELP");
  check("1 '>Help' HELP -> id 1, text '>Help', key HELP", help.id === '1' && help.text === '>Help' && help.commandKey === 'HELP' && !help.textIsField);
  const f3 = p('2 &F3 CA03');
  check('2 &F3 CA03 -> a program-to-system field text with key CA03', f3.id === '2' && f3.text === '&F3' && f3.textIsField && f3.commandKey === 'CA03');
  const enter = p("3 'E>nter'");
  check("3 'E>nter' -> no command key (defaults to ENTER)", enter.id === '3' && enter.text === 'E>nter' && enter.commandKey === '' && !enter.spaceBefore);
  const sp = p("4 'X' CF01 *SPACEB");
  check('command key and *SPACEB both parsed', sp.commandKey === 'CF01' && sp.spaceBefore === true);
  const q = p("5 'It''s'");
  check("doubled apostrophes collapse ('It''s' -> It's)", q.text === "It's");
  const lower = p("6 'x' cf12");
  check('a lowercase command key is normalized to uppercase', lower.commandKey === 'CF12');
  const bad = p('garbage');
  check('unparseable text does not throw and yields a blank id', bad.id === '');

  const c = DspfWriter.composePshbtnchcParams;
  check("compose round-trips example 1", c(help) === "1 '>Help' HELP");
  check('compose round-trips a &field text unquoted', c(f3) === '2 &F3 CA03');
  check('compose omits a blank command key', c(enter) === "3 'E>nter'");
  check('compose appends *SPACEB last', c(sp) === "4 'X' CF01 *SPACEB");
  check('compose re-doubles apostrophes', c(q) === "5 'It''s'");
  check('the command-key list has all 24 CA, 24 CF and 7 named keys', DspfWriter.PSHBTNCHC_COMMAND_KEYS.length === 55 &&
    ['CA01', 'CA24', 'CF01', 'CF24', 'PRINT', 'HELP', 'CLEAR', 'ENTER', 'HOME', 'ROLLUP', 'ROLLDOWN'].every((k) => DspfWriter.PSHBTNCHC_COMMAND_KEYS.indexOf(k) >= 0));
}

console.log('\nA2. PSHBTNFLD parameters - IBM\'s (*NUMCOL n) grammar');
{
  const none = DspfWriter.getPshbtnfld([]);
  check('absent -> present false', none.present === false);
  const bare = DspfWriter.getPshbtnfld([kwd('PSHBTNFLD')]);
  check('bare PSHBTNFLD is present with nothing specified', bare.present && bare.restrict === '' && bare.numCol === '' && bare.numRow === '' && bare.gutter === '');
  const full = DspfWriter.getPshbtnfld([kwd('PSHBTNFLD', '*RSTCSR (*NUMCOL 3) (*GUTTER 4)')]);
  check('*RSTCSR (*NUMCOL 3) (*GUTTER 4) read back', full.restrict === '*RSTCSR' && full.numCol === '3' && full.gutter === '4' && full.numRow === '');
  const norst = DspfWriter.getPshbtnfld([kwd('PSHBTNFLD', '*NORSTCSR (*NUMROW 2)')]);
  check('*NORSTCSR is not mistaken for *RSTCSR; *NUMROW read', norst.restrict === '*NORSTCSR' && norst.numRow === '2');
  const legacy = DspfWriter.getPshbtnfld([kwd('PSHBTNFLD', '*NUMCOL(2)')]);
  check('the *NUMCOL(2) shape this codebase\'s SNGCHCFLD writer emits is read leniently', legacy.numCol === '2');

  const set = DspfWriter.setPshbtnfld([kwd('ALIAS', 'X'), kwd('PSHBTNCHC', "1 'A'")], { present: true, restrict: '*RSTCSR', numCol: '3', gutter: '4' });
  const written = set.find((k) => k.name === 'PSHBTNFLD');
  check('written in IBM\'s shape: *RSTCSR (*NUMCOL 3) (*GUTTER 4)', written && written.parameters === '*RSTCSR (*NUMCOL 3) (*GUTTER 4)');
  check('other keywords (incl. PSHBTNCHC) are untouched', set.some((k) => k.name === 'ALIAS') && set.some((k) => k.name === 'PSHBTNCHC'));
  check('PSHBTNFLD carries no conditions (option indicators not valid)', written.conditions.length === 0);
  const both = DspfWriter.setPshbtnfld([], { present: true, numCol: '2', numRow: '3' }).find((k) => k.name === 'PSHBTNFLD');
  check('*NUMCOL and *NUMROW are alternatives - a backstop keeps only *NUMCOL', both.parameters === '(*NUMCOL 2)');
  const off = DspfWriter.setPshbtnfld([kwd('PSHBTNFLD', '*RSTCSR'), kwd('TEXT', "'t'")], { present: false });
  check('present:false removes PSHBTNFLD only', !off.some((k) => k.name === 'PSHBTNFLD') && off.some((k) => k.name === 'TEXT'));
  const noParams = DspfWriter.setPshbtnfld([], { present: true }).find((k) => k.name === 'PSHBTNFLD');
  check('no parameters -> bare PSHBTNFLD', noParams.parameters === '');
}

console.log('\nA3. Whitelist guard (pshbtnfldConflictReason)');
{
  const r = DspfWriter.pshbtnfldConflictReason;
  check('turning PSHBTNFLD on for a clean field is fine', r('PSHBTNFLD', '', []) === null);
  for (const ok of ['ALIAS', 'CHANGE', 'CHCAVAIL', 'CHCUNAVAIL', 'CHCCTL', 'INDTXT', 'NOCCSID', 'PSHBTNCHC', 'TEXT']) {
    check('PSHBTNFLD allowed alongside ' + ok, r('PSHBTNFLD', '', [kwd(ok, "1")]) === null);
  }
  check('PSHBTNFLD allowed alongside DSPATR(PC)', r('PSHBTNFLD', '', [kwd('DSPATR', 'PC')]) === null);
  const hi = r('PSHBTNFLD', '', [kwd('DSPATR', 'HI')]);
  check('PSHBTNFLD blocked by DSPATR(HI), naming it', !!hi && hi.indexOf('DSPATR') !== -1);
  check('PSHBTNFLD blocked by DSPATR(PC HI) (only PC is allowed)', !!r('PSHBTNFLD', '', [kwd('DSPATR', 'PC HI')]));
  const many = r('PSHBTNFLD', '', [kwd('EDTCDE', 'Y'), kwd('SNGCHCFLD'), kwd('TEXT', "'x'")]);
  check('all offenders are named, the allowed one is not', !!many && many.indexOf('EDTCDE') !== -1 && many.indexOf('SNGCHCFLD') !== -1 && !/TEXT,|, TEXT/.test(many.split('(per')[0].replace('TEXT.', '')));
  check('adding a non-whitelisted keyword to a PSHBTNFLD field is blocked (EDTCDE)', !!r('EDTCDE', 'Y', [kwd('PSHBTNFLD')]));
  check('...and SNGCHCFLD / MLTCHCFLD / CHOICE are blocked too', ['SNGCHCFLD', 'MLTCHCFLD', 'CHOICE'].every((n) => !!r(n, '', [kwd('PSHBTNFLD')])));
  check('adding DSPATR(PC) to a PSHBTNFLD field is allowed', r('DSPATR', 'PC', [kwd('PSHBTNFLD')]) === null);
  check('adding DSPATR(HI) to a PSHBTNFLD field is blocked', !!r('DSPATR', 'HI', [kwd('PSHBTNFLD')]));
  check('adding an allowed keyword (TEXT) to a PSHBTNFLD field is fine', r('TEXT', "'x'", [kwd('PSHBTNFLD')]) === null);
  check('a keyword on a field WITHOUT PSHBTNFLD is never blocked', r('EDTCDE', 'Y', [kwd('DSPATR', 'HI')]) === null);
  check('PSHBTNCHC without PSHBTNFLD is blocked', !!r('PSHBTNCHC', "1 'A'", []));
  check('PSHBTNCHC with PSHBTNFLD is fine', r('PSHBTNCHC', "1 'A'", [kwd('PSHBTNFLD')]) === null);
}

console.log('\nA4. Definition rule (pshbtnfldDefinitionUpdates)');
{
  const u = DspfWriter.pshbtnfldDefinitionUpdates;
  check('a conforming field needs no change', u({ dataType: 'Y', length: 2, decimalPositions: 0, usage: 'B' }) === null);
  check('input-only (I) is also input-capable and kept', u({ dataType: 'Y', length: 2, decimalPositions: 0, usage: 'I' }) === null);
  const c = u({ dataType: 'A', length: 10, decimalPositions: null, usage: 'O' });
  check('a 10A O field is converted to Y / 2 / 0 / B', c.dataType === 'Y' && c.length === 2 && c.decimalPositions === 0 && c.usage === 'B');
  const partial = u({ dataType: 'Y', length: 5, decimalPositions: 0, usage: 'I' });
  check('only the keys that differ are returned', Object.keys(partial).join() === 'length');
  check('missing decimals (null) is written as an explicit 0', u({ dataType: 'Y', length: 2, decimalPositions: null, usage: 'B' }).decimalPositions === 0);
}

// ===========================================================================
// B. DspfEngine preview
// ===========================================================================
function screenOf(lines, indicators) {
  const src = lines.join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const screen = DspfEngine.resolveScreen(model, 'SCR1', indicators || new Set());
  return { screen, html: DspfEngine.renderScreenHtml(screen) };
}
const rec = buildLine({ seq: '00010', nameType: 'R', name: 'SCR1' });
const pbField = (seq, line, extra) => buildLine(Object.assign({ seq, name: 'BTN', length: '2', dataType: 'Y', decimals: '0', usage: 'B', line: String(line), col: '2', func: 'PSHBTNFLD' }, extra || {}));
const chc = (seq, text, extra) => buildLine(Object.assign({ seq, func: 'PSHBTNCHC(' + text + ')' }, extra || {}));

console.log('\nB1. Every PSHBTNCHC becomes its own button (IBM\'s worked example)');
{
  const { screen, html } = screenOf([
    rec,
    pbField('00020', 24),
    chc('00030', "1 '>Help' HELP", { ind1: '01' }),
    chc('00040', '2 &F3 CA03'),
    chc('00050', "3 'E>nter'"),
  ], new Set(['01']));
  const f = screen.fields.find((x) => x.name === 'BTN');
  check('the widget is the new "pshbtn" type', f.widget && f.widget.type === 'pshbtn');
  check('three choices, in choice-number order', f.widget.choices.map((c) => c.id).join() === '1,2,3');
  check("mnemonics stripped: '>Help' shows Help, 'E>nter' shows Enter", f.widget.choices[0].label === 'Help' && f.widget.choices[2].label === 'Enter');
  check('a &field text is shown as-is', f.widget.choices[1].label === '&F3');
  const buttons = html.match(/class="dspf-pshbtn"/g) || [];
  check('three <button>s are rendered', buttons.length === 3);
  check('the raw parameter string is NOT rendered as a label any more', html.indexOf("1 &#39;&gt;Help&#39; HELP") === -1 && html.indexOf('>Help</button>') !== -1);
  check('the command key is exposed as the button title', /title="HELP"/.test(html) && /title="CA03"/.test(html));
  check('the widget class is dspf-widget-pshbtn', /dspf-widget-pshbtn/.test(html));
  check('default layout: one row, gutter 3', f.widget.layout.rows === 1 && f.widget.layout.cols === 3 && f.widget.layout.gutter === 3);
  check('the field occupies the whole button row, not its 2-column DDS length', f.length > 2 && f.height === 1);
}

console.log('\nB2. Option indicators compress the list');
{
  const off = screenOf([rec, pbField('00020', 24), chc('00030', "1 '>Help' HELP", { ind1: '01' }), chc('00040', "2 'Two'")], new Set());
  const f = off.screen.fields.find((x) => x.name === 'BTN');
  check('with indicator 01 off, only choice 2 is shown', f.widget.choices.length === 1 && f.widget.choices[0].id === '2');
}

console.log('\nB3. Layout: *NUMCOL, *NUMROW, *GUTTER, *SPACEB');
{
  const four = (params, extra) => [rec, pbField('00020', 10, { func: 'PSHBTNFLD' + (params ? '(' + params + ')' : '') }),
    chc('00030', "1 'One'"), chc('00040', "2 'Two'"), chc('00050', "3 'Three'", extra), chc('00060', "4 'Four'")];
  const col = screenOf(four('(*NUMCOL 2) (*GUTTER 5)')).screen.fields.find((x) => x.name === 'BTN');
  check('(*NUMCOL 2) -> 2 columns x 2 rows, gutter 5', col.widget.layout.cols === 2 && col.widget.layout.rows === 2 && col.widget.layout.gutter === 5 && col.height === 2);
  const row = screenOf(four('(*NUMROW 2)')).screen.fields.find((x) => x.name === 'BTN');
  check('(*NUMROW 2) -> 2 rows x 2 columns, filled column by column', row.widget.layout.rows === 2 && row.widget.layout.cols === 2 && row.widget.layout.byColumn === true);
  const rowHtml = screenOf(four('(*NUMROW 2)')).html;
  check('column-major cells get explicit grid placement', /grid-row:2;grid-column:1;/.test(rowHtml));
  const legacy = screenOf(four('*NUMCOL(2)')).screen.fields.find((x) => x.name === 'BTN');
  check('the *NUMCOL(2) shape is read leniently by the preview too', legacy.widget.layout.cols === 2);
  const sp = screenOf(four('', undefined)).screen.fields.find((x) => x.name === 'BTN');
  const spaced = screenOf([rec, pbField('00020', 10), chc('00030', "1 'One'"), chc('00040', "2 'Two' *SPACEB")]).screen.fields.find((x) => x.name === 'BTN');
  check('*SPACEB inserts a blank slot before its choice (3 slots for 2 buttons)', spaced.widget.layout.slots.length === 3 && spaced.widget.layout.slots[1] === null);
  check('(sanity) the un-spaced four-button default is one row of four', sp.widget.layout.cols === 4);
  const spacedHtml = screenOf([rec, pbField('00020', 10), chc('00030', "1 'One'"), chc('00040', "2 'Two' *SPACEB")]).html;
  check('the blank slot renders as a gap element', /dspf-pshbtn-gap/.test(spacedHtml));
}

console.log('\nB4. Mnemonic escaping and the no-choice fallback');
{
  const esc = screenOf([rec, pbField('00020', 10), chc('00030', "1 'X >>= 1'"), chc('00040', "2 'X >>>= 1'"), chc('00050', "3 'F2=>File'")]).screen.fields.find((x) => x.name === 'BTN');
  check("'X >>= 1' shows 'X >= 1' (doubled > is literal)", esc.widget.choices[0].label === 'X >= 1');
  check("'X >>>= 1' shows 'X >= 1' too (IBM's own table)", esc.widget.choices[1].label === 'X >= 1');
  check("'F2=>File' shows 'F2=File'", esc.widget.choices[2].label === 'F2=File');
  const none = screenOf([rec, pbField('00020', 10)]).screen.fields.find((x) => x.name === 'BTN');
  check('a PSHBTNFLD with no PSHBTNCHC keeps the old single placeholder button', none.widget && none.widget.type === 'button');
}

// ===========================================================================
// C. Real generated webview
// ===========================================================================
function makeDom(src) {
  const html = webviewHtml('vscode-webview://fake', 'testnonce', src, 'PB.DSPF');
  const posted = [];
  const errors = [];
  const alerts = [];
  const dom = newWebviewDom(html, {
    beforeParse(window) {
      window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
      window.alert = (m) => alerts.push(m);
      window.addEventListener('error', (e) => errors.push(e.error || e.message));
      window.Element.prototype.getBoundingClientRect = function () {
        return { width: 800, height: 480, left: 0, top: 0, right: 800, bottom: 480, x: 0, y: 0, toJSON() {} };
      };
    },
  });
  return { dom, posted, errors, alerts };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function scenario(lines, fn) {
  const ctx = makeDom(lines.join('\n') + '\n');
  await sleep(450);
  const doc = ctx.dom.window.document;
  const Ev = ctx.dom.window.Event;
  ctx.doc = doc;
  ctx.fire = (el, type) => el.dispatchEvent(new Ev(type, { bubbles: true }));
  ctx.select = (name) => {
    const el = doc.querySelector('.dspf-field[data-field="' + name + '"]');
    if (!el) return null;
    el.dispatchEvent(new Ev('click', { bubbles: true }));
    return 'field-' + el.getAttribute('data-source-line');
  };
  ctx.reset = () => { ctx.posted.length = 0; ctx.alerts.length = 0; };
  ctx.lastEdit = () => { const m = ctx.posted.filter((x) => x.type === 'applyEdit').pop(); return m ? DspfParser.parseDspf(m.text) : null; };
  ctx.fieldOf = (model, name) => model.records.find((r) => r.name === 'SCR1').fields.find((f) => f.name === name);
  await fn(ctx);
  check('no uncaught errors in this scenario', ctx.errors.length === 0);
}

const plainField = (name, extra) => buildLine(Object.assign({ seq: '00020', name, length: '10', dataType: 'A', usage: 'O', line: '2', col: '2' }, extra || {}));

async function main() {
  console.log('\nC1. Turning PSHBTNFLD on converts the field in ONE edit');
  await scenario([rec, plainField('TXTFLD')], async (c) => {
    const owner = c.select('TXTFLD');
    check('setup: field selected', !!owner);
    const on = c.doc.getElementById(owner + '-pb-on');
    check('the Push button field accordion is present with an unchecked toggle', !!on && on.checked === false);
    check('no choices editor yet (not a push-button field)', !c.doc.querySelector('.repeat-inst-add[data-prefix="' + owner + '-pbc-rep"]'));
    c.reset();
    on.checked = true;
    c.fire(on, 'change');
    const m = c.lastEdit();
    check('an edit was posted with no alert', !!m && c.alerts.length === 0);
    const f = m && c.fieldOf(m, 'TXTFLD');
    check('the field is now type Y, length 2, decimals 0, usage B (was 10A O)', f && f.dataType === 'Y' && f.length === 2 && f.decimalPositions === 0 && f.usage === 'B');
    check('it carries PSHBTNFLD', f && f.keywords.some((k) => k.name === 'PSHBTNFLD'));
    const chcs = f ? f.keywords.filter((k) => k.name === 'PSHBTNCHC') : [];
    check("...and one seeded valid choice PSHBTNCHC(1 'Enter')", chcs.length === 1 && chcs[0].parameters === "1 'Enter'");
  });

  console.log('\nC2. Turning it on is blocked while the field carries a non-whitelisted keyword');
  await scenario([rec, plainField('TXTFLD'), buildLine({ seq: '00021', func: 'DSPATR(HI)' })], async (c) => {
    const owner = c.select('TXTFLD');
    const on = c.doc.getElementById(owner + '-pb-on');
    c.reset();
    on.checked = true;
    c.fire(on, 'change');
    check('blocked with an alert naming DSPATR', c.alerts.length === 1 && c.alerts[0].indexOf('DSPATR') !== -1);
    check('nothing was posted and the checkbox reverted', !c.lastEdit() && on.checked === false);
  });

  const pbSrc = [rec, pbField('00020', 4), chc('00030', "1 'Help' HELP"), chc('00040', "2 'Save'")];

  console.log('\nC3. An existing push-button field: params, validation, turning off');
  await scenario(pbSrc, async (c) => {
    const owner = c.select('BTN');
    const on = c.doc.getElementById(owner + '-pb-on');
    check('toggle is checked, params editor and choices editor are shown', on.checked && !!c.doc.getElementById(owner + '-pb-numcol') && !!c.doc.querySelector('.repeat-inst-add[data-prefix="' + owner + '-pbc-rep"]'));
    const apply = () => c.doc.querySelector('.' + owner + '-pb-apply').dispatchEvent(new c.dom.window.Event('click', { bubbles: true }));
    c.reset();
    c.doc.getElementById(owner + '-pb-rstcsr').value = '*RSTCSR';
    c.doc.getElementById(owner + '-pb-numcol').value = '2';
    c.doc.getElementById(owner + '-pb-gutter').value = '4';
    apply();
    let f = c.fieldOf(c.lastEdit(), 'BTN');
    const pk = f && f.keywords.find((k) => k.name === 'PSHBTNFLD');
    check('Apply writes *RSTCSR (*NUMCOL 2) (*GUTTER 4) in IBM\'s grammar', pk && pk.parameters.replace(/\s+/g, ' ').trim() === '*RSTCSR (*NUMCOL 2) (*GUTTER 4)');
    check('the choices survive a params Apply', f && f.keywords.filter((k) => k.name === 'PSHBTNCHC').length === 2);

    c.reset();
    c.doc.getElementById(owner + '-pb-numrow').value = '3';
    apply();
    check('*NUMCOL together with *NUMROW is refused', c.alerts.length === 1 && /not both/i.test(c.alerts[0]) && !c.lastEdit());
    c.reset();
    c.doc.getElementById(owner + '-pb-numrow').value = '';
    c.doc.getElementById(owner + '-pb-gutter').value = '1';
    apply();
    check('a gutter of 1 is refused (must be greater than one)', c.alerts.length === 1 && /greater than one/i.test(c.alerts[0]) && !c.lastEdit());

    c.reset();
    on.checked = false;
    c.fire(on, 'change');
    f = c.fieldOf(c.lastEdit(), 'BTN');
    check('turning it off removes PSHBTNFLD AND its now-orphaned PSHBTNCHC choices', f && !f.keywords.some((k) => k.name === 'PSHBTNFLD' || k.name === 'PSHBTNCHC'));
    check('the field itself remains', !!f);
  });

  console.log('\nC4. Choices editor: add, edit, duplicate guard, command key, *SPACEB, remove');
  await scenario(pbSrc, async (c) => {
    const owner = c.select('BTN');
    const P = owner + '-pbc-rep';
    const cls = (i, part) => '.' + P + '-inst' + i + '-' + part;
    const chcList = (m) => c.fieldOf(m, 'BTN').keywords.filter((k) => k.name === 'PSHBTNCHC').map((k) => k.parameters);
    check('both existing choices render with their number/text/key', c.doc.querySelector(cls(0, 'id')).value === '1' && c.doc.querySelector(cls(0, 'text')).value === 'Help' && c.doc.querySelector(cls(0, 'key')).value === 'HELP' && c.doc.querySelector(cls(1, 'text')).value === 'Save');

    c.reset();
    c.doc.querySelector('.repeat-inst-add[data-prefix="' + P + '"]').dispatchEvent(new c.dom.window.Event('click', { bubbles: true }));
    let list = chcList(c.lastEdit());
    check("+ Add uses the next free number: 3 'Choice 3'", list.length === 3 && list[2] === "3 'Choice 3'");

    c.reset();
    c.doc.querySelector(cls(1, 'id')).value = '1';
    c.fire(c.doc.querySelector(cls(1, 'id')), 'change');
    check('renumbering choice 2 to the already-used 1 is refused', c.alerts.length === 1 && /already used/i.test(c.alerts[0]) && !c.lastEdit());
    c.reset();
    c.doc.querySelector(cls(1, 'id')).value = '100';
    c.fire(c.doc.querySelector(cls(1, 'id')), 'change');
    check('a choice number above 99 is refused', c.alerts.length === 1 && /1 to 99/.test(c.alerts[0]) && !c.lastEdit());
    c.reset();
    c.doc.querySelector(cls(1, 'text')).value = '   ';
    c.fire(c.doc.querySelector(cls(1, 'text')), 'change');
    check('blank choice text is refused', c.alerts.length === 1 && /required/i.test(c.alerts[0]) && !c.lastEdit());

    c.reset();
    c.doc.querySelector(cls(1, 'key')).value = 'CA03';
    c.fire(c.doc.querySelector(cls(1, 'key')), 'change');
    check("choosing command key CA03 writes 2 'Save' CA03", chcList(c.lastEdit())[1] === "2 'Save' CA03");

    c.reset();
    c.doc.querySelector(cls(0, 'spaceb')).checked = true;
    c.fire(c.doc.querySelector(cls(0, 'spaceb')), 'change');
    check("ticking *SPACEB writes 1 'Help' HELP *SPACEB", chcList(c.lastEdit())[0] === "1 'Help' HELP *SPACEB");

    c.reset();
    c.doc.querySelector(cls(1, 'text')).value = '&SAVTXT';
    c.fire(c.doc.querySelector(cls(1, 'text')), 'change');
    // NB: the webview re-renders from its own updated model after every
    // edit, so state accumulates across this scenario's steps - choice 2
    // still carries the CA03 set earlier.
    check('a &field text is written unquoted (keeping the earlier CA03)', chcList(c.lastEdit())[1] === '2 &SAVTXT CA03');

    c.reset();
    c.doc.querySelector(cls(1, 'text')).value = "It's";
    c.fire(c.doc.querySelector(cls(1, 'text')), 'change');
    check("an apostrophe in the text is doubled ('It''s')", chcList(c.lastEdit())[1] === "2 'It''s' CA03");

    c.reset();
    c.doc.querySelector('.repeat-inst-remove[data-prefix="' + P + '"][data-idx="0"]').dispatchEvent(new c.dom.window.Event('click', { bubbles: true }));
    list = chcList(c.lastEdit());
    check('remove drops that choice only (the added choice 3 and edited choice 2 remain)', list.length === 2 && list[0] === "2 'It''s' CA03" && list[1] === "3 'Choice 3'");
    check('each remaining choice row has its own Conditioning toggle (option indicators valid)', c.doc.querySelectorAll('.repeat-inst-cond-toggle[data-prefix="' + P + '"]').length === 2);
  });

  console.log('\nC5. Raw keyword editor and Choice-selection-type guards');
  await scenario(pbSrc, async (c) => {
    const owner = c.select('BTN');
    function addRaw(name, params) {
      c.doc.getElementById(owner + '-new-kw-name').value = name;
      c.doc.getElementById(owner + '-new-kw-params').value = params || '';
      c.reset();
      c.doc.querySelector('.kw-add[data-owner="' + owner + '"]').dispatchEvent(new c.dom.window.Event('click', { bubbles: true }));
      return { alert: c.alerts[0] || null, model: c.lastEdit() };
    }
    let r = addRaw('EDTCDE', 'Y');
    check('EDTCDE blocked on a push-button field', !!r.alert && r.alert.indexOf('EDTCDE') !== -1 && !r.model);
    r = addRaw('DSPATR', 'HI');
    check('DSPATR(HI) blocked', !!r.alert && !r.model);
    r = addRaw('DSPATR', 'PC');
    check('DSPATR(PC) is allowed', !r.alert && !!r.model);
    r = addRaw('TEXT', "'Button field'");
    check('TEXT is allowed', !r.alert && !!r.model);

    c.reset();
    c.doc.getElementById(owner + '-cst-kind').value = 'SNGCHCFLD';
    c.doc.querySelector('.' + owner + '-cst-apply').dispatchEvent(new c.dom.window.Event('click', { bubbles: true }));
    check('Choice selection type SNGCHCFLD is blocked on a push-button field', c.alerts.length === 1 && c.alerts[0].indexOf('SNGCHCFLD') !== -1 && !c.lastEdit());
  });
  await scenario([rec, plainField('TXTFLD')], async (c) => {
    const owner = c.select('TXTFLD');
    c.doc.getElementById(owner + '-new-kw-name').value = 'PSHBTNCHC';
    c.doc.getElementById(owner + '-new-kw-params').value = "1 'A'";
    c.reset();
    c.doc.querySelector('.kw-add[data-owner="' + owner + '"]').dispatchEvent(new c.dom.window.Event('click', { bubbles: true }));
    check('PSHBTNCHC cannot be added by hand to a field without PSHBTNFLD', c.alerts.length === 1 && /PSHBTNFLD/.test(c.alerts[0]) && !c.lastEdit());
    c.reset();
    c.doc.getElementById(owner + '-cst-kind').value = 'SNGCHCFLD';
    c.doc.querySelector('.' + owner + '-cst-apply').dispatchEvent(new c.dom.window.Event('click', { bubbles: true }));
    check('(no regression) SNGCHCFLD still applies on an ordinary field', c.alerts.length === 0 && !!c.lastEdit());
  });

  console.log('\nC6. The add-field panel offers a "Push button" field kind');
  await scenario([rec, plainField('TXTFLD')], async (c) => {
    c.doc.getElementById('placeFieldBtn').dispatchEvent(new c.dom.window.Event('click', { bubbles: true }));
    c.doc.querySelector('.dspf-screen').dispatchEvent(new c.dom.window.MouseEvent('click', { bubbles: true, clientX: 55, clientY: 95 }));
    const kind = c.doc.getElementById('p-place-field-kind');
    check('a Field kind selector exists (Standard / Push button)', !!kind && kind.options.length === 2);
    check('standard inputs are shown and the push-button inputs hidden by default', c.doc.getElementById('p-place-pb-wrap').style.display === 'none' && c.doc.getElementById('p-place-std-wrap').style.display !== 'none');
    kind.value = 'pshbtn';
    c.fire(kind, 'change');
    check('choosing Push button swaps in the button inputs and hides Length/Type/Usage', c.doc.getElementById('p-place-pb-wrap').style.display !== 'none' && c.doc.getElementById('p-place-std-wrap').style.display === 'none');
    c.doc.getElementById('p-place-name').value = 'CMDBTN';
    c.doc.getElementById('p-place-pb-text').value = 'E>xit';
    c.doc.getElementById('p-place-pb-key').value = 'CF03';
    c.reset();
    c.doc.getElementById('p-place-add').dispatchEvent(new c.dom.window.Event('click', { bubbles: true }));
    const f = c.lastEdit() && c.fieldOf(c.lastEdit(), 'CMDBTN');
    check('the new field is type Y, length 2, decimals 0, usage B', f && f.dataType === 'Y' && f.length === 2 && f.decimalPositions === 0 && f.usage === 'B');
    check('it has PSHBTNFLD and PSHBTNCHC(1 \'E>xit\' CF03)', f && f.keywords.some((k) => k.name === 'PSHBTNFLD') && f.keywords.some((k) => k.name === 'PSHBTNCHC' && k.parameters === "1 'E>xit' CF03"));
  });
  await scenario([rec, plainField('TXTFLD')], async (c) => {
    c.doc.getElementById('placeFieldBtn').dispatchEvent(new c.dom.window.Event('click', { bubbles: true }));
    c.doc.querySelector('.dspf-screen').dispatchEvent(new c.dom.window.MouseEvent('click', { bubbles: true, clientX: 55, clientY: 95 }));
    c.doc.getElementById('p-place-name').value = 'PLAIN1';
    c.reset();
    c.doc.getElementById('p-place-add').dispatchEvent(new c.dom.window.Event('click', { bubbles: true }));
    const f = c.lastEdit() && c.fieldOf(c.lastEdit(), 'PLAIN1');
    check('(no regression) a Standard field is still created with the entered length/type', f && f.length === 10 && f.dataType === 'A' && !f.keywords.some((k) => k.name === 'PSHBTNFLD'));
  });

  console.log('\nC7. The design-surface preview shows every button');
  await scenario(pbSrc, async (c) => {
    const buttons = c.doc.querySelectorAll('.dspf-field[data-field="BTN"] .dspf-pshbtn');
    check('the canvas draws one button per PSHBTNCHC', buttons.length === 2 && buttons[0].textContent === 'Help' && buttons[1].textContent === 'Save');
  });

  console.log(failureCount() === 0 ? '\nALL CHECKS PASSED' : '\n' + failureCount() + ' CHECK(S) FAILED');
  process.exit(failureCount() === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });

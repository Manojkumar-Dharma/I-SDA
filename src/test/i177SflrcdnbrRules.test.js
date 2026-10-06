/**
 * i177SflrcdnbrRules.test.js
 *
 * Task I-177 - SFLRCDNBR's own DDS Reference section states three rules nothing
 * enforced (opened from I-122d):
 *   1. "You cannot specify both SFLRCDNBR and SFLROLVAL for the same field."
 *   2. The format is SFLRCDNBR[([CURSOR] [*TOP])] - only those two words, each once.
 *   3. "This field must be a zoned decimal field with zero decimal positions. It must
 *      have the keyboard shift attribute of signed numeric (S in position 35), and it
 *      can be up to 4 digits in length. It must be defined as an output-only, an
 *      input/output, or a hidden field."
 *
 * Covers the spec facts, the pure functions, and (jsdom, through the real generated
 * designer script) the selector's rewrite-on-enable, the SFLROLVAL checkbox refusal,
 * the Basic tab Apply block and the raw keyword editor's commitEdit backstop.
 * Run with: node src/test/i177SflrcdnbrRules.test.js
 */
const path = require('path');
const fs = require('fs');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const DspfParser = require('../../dist/dspfParser.js');
const { check, failureCount } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');

const k = (name, params) => ({ name: name, parameters: params || '', conditions: [], raw: '', sourceLines: [] });
const fld = (dataType, length, decimalPositions, usage) => ({ dataType: dataType, length: length, decimalPositions: decimalPositions, usage: usage });

console.log('\nkeywordSpec.js RECORD_TYPES.SFLRCDNBR');
{
  const req = KeywordSpec.definitionRequirements('SFLRCDNBR');
  const pw = KeywordSpec.parameterWords('SFLRCDNBR');
  check('same-field mutex with SFLROLVAL is recorded', KeywordSpec.isMutex('SFLRCDNBR', 'SFLROLVAL') === true);
  check('parameter words are CURSOR and *TOP, each at most once', !!pw && pw.allowed.join() === 'CURSOR,*TOP' && pw.eachAtMostOnce === true);
  check('shape: S (blank with decimals ok), 1 to 4 digits, 0 decimals, usage O/B/H (default H)',
    !!req && req.dataType === 'S' && req.dataTypeBlankWithDecimals === true && req.lengthMin === 1 && req.lengthMax === 4 && req.decimalPositions === 0 && req.usage.join() === 'O,B,H' && req.usageDefault === 'H');
  check('parameterWords is a copy', (function () { const a = KeywordSpec.parameterWords('SFLRCDNBR'); a.allowed.push('X'); return KeywordSpec.parameterWords('SFLRCDNBR').allowed.length === 2; })());
  check('a keyword with no such rule answers null', KeywordSpec.parameterWords('SFLROLVAL') === null);
  const ref = fs.readFileSync(path.join(__dirname, '../../docs/sda-reference/source/DDS_Keyword_V7r6.txt'), 'utf8').replace(/\s+/g, ' ');
  check('shape citation appears verbatim in DDS_Keyword_V7r6.txt', ref.indexOf(req.ddsReference) !== -1);
  check('format citation appears verbatim', ref.indexOf(pw.ddsReference) !== -1);
  check('mutex sentence appears verbatim', ref.indexOf('You cannot specify both SFLRCDNBR and SFLROLVAL for the same field.') !== -1);
}

console.log('\nDspfWriter.sflrcdnbrParameterIssue');
{
  const p = DspfWriter.sflrcdnbrParameterIssue;
  check('empty, CURSOR, *TOP, both orders and lower case are fine',
    p('') === null && p('CURSOR') === null && p('*TOP') === null && p('CURSOR *TOP') === null && p('*TOP CURSOR') === null && p('cursor *top') === null);
  check('FOO is refused, naming FOO', /FOO/.test(p('FOO') || ''));
  check('CURSOR beside an unknown word is refused', /BAR/.test(p('CURSOR BAR') || ''));
  check('CURSOR twice is refused, naming CURSOR', /CURSOR/.test(p('CURSOR CURSOR') || '') && /once/.test(p('CURSOR CURSOR')));
  check('*TOP twice is refused', /\*TOP/.test(p('*TOP *TOP') || ''));
  check('TOP without the star is refused', p('TOP') !== null);
  check('null is handled', p(null) === null);
}

console.log('\nDspfWriter.sflrcdnbrDefinitionUpdates');
{
  const u = DspfWriter.sflrcdnbrDefinitionUpdates;
  check('S/4/0/H conforms', u(fld('S', 4, 0, 'H')) === null);
  check('length 1, 2, 3 and usage O, B all conform', u(fld('S', 1, 0, 'O')) === null && u(fld('S', 2, 0, 'B')) === null && u(fld('S', '3', '0', 'b')) === null);
  check('blank type with decimals 0 conforms', u(fld('', 4, 0, 'H')) === null);
  check('blank type with no decimals is rewritten (type and decimals)', JSON.stringify(u(fld('', 4, '', 'H'))) === JSON.stringify({ dataType: 'S', decimalPositions: 0 }));
  check('length 5 -> 4 only', JSON.stringify(u(fld('S', 5, 0, 'H'))) === JSON.stringify({ length: 4 }));
  check('length 0 and blank length -> 4', u(fld('S', 0, 0, 'H')).length === 4 && u(fld('S', '', 0, 'H')).length === 4);
  check('usage I -> H only', JSON.stringify(u(fld('S', 4, 0, 'I'))) === JSON.stringify({ usage: 'H' }));
  check('usage P -> H', u(fld('S', 4, 0, 'P')).usage === 'H');
  check('decimals 2 -> 0 only', JSON.stringify(u(fld('S', 4, 2, 'H'))) === JSON.stringify({ decimalPositions: 0 }));
  check('packed (P) -> S only', JSON.stringify(u(fld('P', 4, 0, 'H'))) === JSON.stringify({ dataType: 'S' }));
  check('alpha 10 input -> all four', JSON.stringify(u(fld('A', 10, '', 'I'))) === JSON.stringify({ dataType: 'S', length: 4, decimalPositions: 0, usage: 'H' }));
  check('null field is handled', u(null) !== undefined);
}

console.log('\nDspfWriter.sflrcdnbrFieldConflictReason (panel guard)');
{
  const f = DspfWriter.sflrcdnbrFieldConflictReason;
  check('SFLRCDNBR on a field that has SFLROLVAL is refused, naming both', /SFLRCDNBR/.test(f([k('SFLROLVAL')], 'SFLRCDNBR') || '') && /SFLROLVAL/.test(f([k('SFLROLVAL')], 'SFLRCDNBR')));
  check('SFLROLVAL on a field that has SFLRCDNBR is refused', f([k('SFLRCDNBR', 'CURSOR')], 'SFLROLVAL') !== null);
  check('either alone is fine', f([], 'SFLRCDNBR') === null && f([], 'SFLROLVAL') === null);
  check('changing SFLRCDNBR\'s own parameter is not a conflict', f([k('SFLRCDNBR', 'CURSOR')], 'SFLRCDNBR') === null);
  check('another keyword is not touched', f([k('SFLROLVAL')], 'SFLSCROLL') === null);
}

console.log('\nDspfWriter.sflrcdnbrBasicEditConflictReason (Basic tab / Resolve)');
{
  const b = DspfWriter.sflrcdnbrBasicEditConflictReason;
  const okField = fld('S', 4, 0, 'H');
  check('no SFLRCDNBR on the field -> never blocks', b([], okField, { length: 9 }) === null);
  check('length 5 is blocked, naming the length', /length 5/.test(b([k('SFLRCDNBR')], okField, { length: 5 }) || ''));
  check('length 2 is allowed (range)', b([k('SFLRCDNBR')], okField, { length: 2 }) === null);
  check('usage I is blocked, usage O and B are not', /usage I/.test(b([k('SFLRCDNBR')], okField, { usage: 'I' }) || '') && b([k('SFLRCDNBR')], okField, { usage: 'O' }) === null && b([k('SFLRCDNBR')], okField, { usage: 'B' }) === null);
  check('data type A and decimals 2 are blocked', b([k('SFLRCDNBR')], okField, { dataType: 'A' }) !== null && b([k('SFLRCDNBR')], okField, { decimalPositions: 2 }) !== null);
  check('an already-invalid field is not re-reported when something else changes', b([k('SFLRCDNBR')], fld('S', 9, 0, 'H'), { usage: 'O' }) === null);
  check('referencedFieldResolveConflictReason carries the check', DspfWriter.referencedFieldResolveConflictReason({ keywords: [k('SFLRCDNBR')], dataType: 'S', length: 4, decimalPositions: 0, usage: 'H' }, { length: 7 }) !== null);
}

console.log('\nDspfWriter.sflrcdnbrNewConflictReason (commitEdit backstop)');
{
  const n = DspfWriter.sflrcdnbrNewConflictReason;
  const good = fld('S', 4, 0, 'H');
  check('adding SFLRCDNBR(CURSOR) to a conforming field is accepted', n([], [k('SFLRCDNBR', 'CURSOR')], good) === null);
  check('adding it bare is accepted', n([], [k('SFLRCDNBR')], good) === null);
  check('adding SFLRCDNBR(FOO) is refused, naming FOO', /FOO/.test(n([], [k('SFLRCDNBR', 'FOO')], good) || ''));
  check('adding SFLRCDNBR(CURSOR CURSOR) is refused', n([], [k('SFLRCDNBR', 'CURSOR CURSOR')], good) !== null);
  check('adding SFLRCDNBR beside SFLROLVAL is refused', /SFLROLVAL/.test(n([k('SFLROLVAL')], [k('SFLROLVAL'), k('SFLRCDNBR')], good) || ''));
  check('adding SFLROLVAL beside SFLRCDNBR is refused', /SFLRCDNBR/.test(n([k('SFLRCDNBR')], [k('SFLRCDNBR'), k('SFLROLVAL')], good) || ''));
  check('adding SFLRCDNBR to an alpha field is refused with the shape text', /signed numeric/.test(n([], [k('SFLRCDNBR')], fld('A', 4, '', 'H')) || ''));
  check('...and to a 5-digit field, a 2-decimal field and an input-only field', n([], [k('SFLRCDNBR')], fld('S', 5, 0, 'H')) !== null && n([], [k('SFLRCDNBR')], fld('S', 4, 2, 'H')) !== null && n([], [k('SFLRCDNBR')], fld('S', 4, 0, 'I')) !== null);
  check('an output (O) or input/output (B) 2-digit field is accepted', n([], [k('SFLRCDNBR')], fld('S', 2, 0, 'O')) === null && n([], [k('SFLRCDNBR')], fld('S', 2, 0, 'B')) === null);
  check('turning it OFF is never blocked', n([k('SFLRCDNBR', 'FOO'), k('SFLROLVAL')], [k('SFLROLVAL')], fld('A', 9, '', 'I')) === null);
  check('an unrelated edit on an already-invalid pair is not re-reported', n([k('SFLRCDNBR', 'FOO'), k('SFLROLVAL')], [k('SFLRCDNBR', 'FOO'), k('SFLROLVAL'), k('DSPATR', 'ND')], fld('A', 9, '', 'I')) === null);
  check('changing an existing SFLRCDNBR to a bad parameter is refused', n([k('SFLRCDNBR', 'CURSOR')], [k('SFLRCDNBR', 'FOO')], good) !== null);
  check('changing an existing SFLRCDNBR from CURSOR to *TOP is accepted', n([k('SFLRCDNBR', 'CURSOR')], [k('SFLRCDNBR', '*TOP')], good) === null);
}

// ===========================================================================
console.log('\n=== the panels (jsdom) ===');
function dds(o) {
  const a = Array(80).fill(' ');
  const put = (c, str) => { for (let i = 0; i < str.length; i++) a[c - 1 + i] = str[i]; };
  put(6, 'A');
  if (o.rec) put(17, 'R');
  if (o.name) put(19, o.name);
  if (o.len !== undefined) put(30, String(o.len).padStart(5));
  if (o.type) put(35, o.type);
  if (o.dec !== undefined) put(36, String(o.dec).padStart(2));
  if (o.usage) put(38, o.usage);
  if (o.line !== undefined) put(39, String(o.line).padStart(3));
  if (o.pos !== undefined) put(42, String(o.pos).padStart(3));
  if (o.fn) put(45, o.fn);
  return a.join('').replace(/\s+$/, '');
}
const SOURCE = [
  dds({ fn: 'DSPSIZ(24 80 *DS3)' }),
  dds({ rec: 1, name: 'SFL1', fn: 'SFL' }),
  dds({ name: 'S1', len: 10, type: 'A', usage: 'B', line: 5, pos: 5 }),
  dds({ rec: 1, name: 'CTL1', fn: 'SFLCTL(SFL1)' }),
  dds({ fn: 'SFLPAG(5) SFLSIZ(10)' }),
  dds({ fn: 'SFLDSP SFLDSPCTL' }),
  dds({ name: 'RCD', len: 4, type: 'S', dec: 0, usage: 'O', line: 1, pos: 2, fn: 'SFLRCDNBR(CURSOR)' }),
  dds({ name: 'ROLL', len: 4, type: 'S', dec: 0, usage: 'B', line: 2, pos: 2, fn: 'SFLROLVAL' }),
  dds({ name: 'ALPHA', len: 10, type: 'A', usage: 'I', line: 3, pos: 2 }),
  dds({ name: 'RAW1', len: 10, type: 'A', usage: 'B', line: 5, pos: 2 }),
  dds({ name: 'BIG', len: 5, type: 'S', dec: 0, usage: 'B', line: 4, pos: 2 }),
].join('\n') + '\n';

const posted = [];
const alerts = [];
const dom = newWebviewDom(webviewHtml('vscode-webview://fake', 'testnonce', SOURCE, 'MYSCR.DSPF'), {
  beforeParse(window) {
    window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
    window.alert = (t) => { alerts.push(String(t)); };
  },
});

setTimeout(() => {
  const doc = dom.window.document;
  const { Event } = dom.window;
  const fire = (el, type) => el.dispatchEvent(new Event(type || 'change', { bubbles: true }));
  const sel = doc.getElementById('recordSelect');
  const selectRecord = (name) => { sel.value = name; fire(sel); };
  const lastText = () => { const e = posted.filter((m) => m.type === 'applyEdit').pop(); return e ? e.text : null; };
  const recFrom = (t, name) => (t ? DspfParser.parseDspf(t).records.find((r) => r.name === name) : null);
  const fieldFrom = (t, rname, fname) => { const r = recFrom(t, rname); return r ? r.fields.find((f) => f.name === fname) : null; };
  const kwOf = (kws, n) => (kws || []).find((x) => x.name === n);
  const clickField = (name) => { const f = doc.querySelector('#screenOutput .dspf-field[data-field="' + name + '"]'); if (f) fire(f, 'click'); return !!f; };
  const open = (name) => { selectRecord('CTL1'); return clickField(name); };
  const reset = () => { posted.length = 0; alerts.length = 0; };

  check('RCD, ROLL, ALPHA, RAW1 and BIG are on the preview canvas', open('RCD') && open('ROLL') && open('ALPHA') && open('RAW1') && open('BIG'));

  console.log('  -- selector: SFLRCDNBR beside SFLROLVAL');
  {
    open('ROLL');
    const rc = doc.querySelector('[id$="-sflrcdnbr"]');
    reset();
    rc.value = 'CURSOR'; fire(rc);
    check('choosing CURSOR on ROLL (which has SFLROLVAL) posts no edit', lastText() === null);
    check('...with a message naming SFLRCDNBR and SFLROLVAL', alerts.some((a) => /SFLRCDNBR/.test(a) && /SFLROLVAL/.test(a)));
    check('...and the selector reverts to none', rc.value === '');
  }
  {
    open('RCD');
    const ro = doc.querySelector('[id$="-sflrolval"]');
    reset();
    ro.checked = true; fire(ro);
    check('ticking SFLROLVAL on RCD (which has SFLRCDNBR) posts no edit', lastText() === null);
    check('...with a message naming both keywords', alerts.some((a) => /SFLRCDNBR/.test(a) && /SFLROLVAL/.test(a)));
    check('...and the checkbox reverts to unticked', ro.checked === false);
  }

  console.log('  -- selector: field shape is brought into line on enable');
  {
    open('ALPHA');
    const rc = doc.querySelector('[id$="-sflrcdnbr"]');
    reset();
    rc.value = '*TOP'; fire(rc);
    const t = lastText();
    const f = fieldFrom(t, 'CTL1', 'ALPHA');
    check('choosing *TOP on an alpha input field writes SFLRCDNBR(*TOP)', !!f && !!kwOf(f.keywords, 'SFLRCDNBR') && kwOf(f.keywords, 'SFLRCDNBR').parameters === '*TOP');
    check('...and rewrites it to S, 4 digits, 0 decimals, hidden', !!f && f.dataType === 'S' && Number(f.length) === 4 && Number(f.decimalPositions) === 0 && f.usage === 'H');
  }
  {
    open('BIG');
    const rc = doc.querySelector('[id$="-sflrcdnbr"]');
    reset();
    rc.value = 'CURSOR'; fire(rc);
    const f = fieldFrom(lastText(), 'CTL1', 'BIG');
    check('a 5-digit input/output field is cut to 4 digits and keeps its usage B', !!f && Number(f.length) === 4 && f.usage === 'B' && f.dataType === 'S' && !!kwOf(f.keywords, 'SFLRCDNBR'));
  }
  {
    open('ROLL');
    const ro = doc.querySelector('[id$="-sflrolval"]');
    reset();
    ro.checked = false; fire(ro);
    open('ROLL');
    const rc = doc.querySelector('[id$="-sflrcdnbr"]');
    reset();
    rc.value = 'CURSOR'; fire(rc);
    const f = fieldFrom(lastText(), 'CTL1', 'ROLL');
    check('with SFLROLVAL unticked, ROLL (S/4/0/B, conforming) takes SFLRCDNBR(CURSOR) with its shape unchanged', !!f && !!kwOf(f.keywords, 'SFLRCDNBR') && f.usage === 'B' && Number(f.length) === 4);
  }

  console.log('  -- raw keyword editor (commitEdit backstop)');
  {
    open('RCD');
    const owner = Array.from(doc.querySelectorAll('.kw-add')).map((e) => e.getAttribute('data-owner')).find((o) => /RCD|field/.test(o || '')) || null;
    check('the field raw keyword editor is reachable on RCD', !!owner);
    if (owner) {
      doc.getElementById(owner + '-new-kw-name').value = 'SFLROLVAL';
      doc.getElementById(owner + '-new-kw-params').value = '';
      reset();
      fire(doc.querySelector('.kw-add[data-owner="' + owner + '"]'), 'click');
      check('raw-adding SFLROLVAL to RCD (which has SFLRCDNBR) is refused: no edit posted', lastText() === null);
      check('...with a message naming SFLRCDNBR and SFLROLVAL', alerts.some((a) => /SFLRCDNBR/.test(a) && /SFLROLVAL/.test(a)));
    }
    open('RAW1');
    const owner2 = Array.from(doc.querySelectorAll('.kw-add')).map((e) => e.getAttribute('data-owner')).find((o) => /field/.test(o || '')) || null;
    if (owner2) {
      doc.getElementById(owner2 + '-new-kw-name').value = 'SFLRCDNBR';
      doc.getElementById(owner2 + '-new-kw-params').value = 'FOO';
      reset();
      fire(doc.querySelector('.kw-add[data-owner="' + owner2 + '"]'), 'click');
      check('raw-adding SFLRCDNBR(FOO) is refused: no edit posted', lastText() === null);
      check('...with a message naming FOO', alerts.some((a) => /FOO/.test(a)));
      open('RAW1');
      doc.getElementById(owner2 + '-new-kw-name').value = 'SFLRCDNBR';
      doc.getElementById(owner2 + '-new-kw-params').value = 'CURSOR';
      reset();
      fire(doc.querySelector('.kw-add[data-owner="' + owner2 + '"]'), 'click');
      check('raw-adding SFLRCDNBR(CURSOR) to an alpha field (RAW1) is refused with the shape text', lastText() === null && alerts.some((a) => /signed numeric/.test(a)));
    } else {
      check('the field raw keyword editor is reachable on RAW1', false);
    }
  }

  console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : 'FAIL - ' + failureCount() + ' check(s) failed'));
  process.exit(failureCount() === 0 ? 0 : 1);
}, 300);

/**
 * i126SflscrollFieldShape.test.js
 *
 * Task I-126 - SFLSCROLL's own DDS Reference section: "This field must have
 * the keyboard shift attribute of signed numeric with zero decimal
 * positions. It has to be 5 digits in length, and it must be defined as a
 * hidden field." (IBM's own example: `F3  5S 0H  SFLSCROLL`.) Nothing
 * enforced any of it - SFLSCROLL was a bare checkbox. Now:
 *  - turning it ON rewrites the field to the required S / 5 / 0 / H shape
 *    in the same edit (sflscrollDefinitionUpdates);
 *  - a later data type / length / decimals / usage change away from it is
 *    blocked (sflscrollBasicEditConflictReason - also in the Resolve
 *    Referenced Field chain), diff-based;
 *  - commitEdit's backstop (sflscrollNewConflictReason) covers any other
 *    path that introduces the keyword.
 *
 * Covers the spec fact, the pure functions, and (in jsdom, through the real
 * generated designer script) the checkbox's rewrite-on-enable.
 * Run with: node src/test/i126SflscrollFieldShape.test.js
 */
const path = require('path');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const DspfParser = require('../../dist/dspfParser.js');
const { check, failureCount } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');

const k = (name, params) => ({ name: name, parameters: params || '', conditions: [], raw: '', sourceLines: [] });
const fld = (dataType, length, decimalPositions, usage) => ({ dataType: dataType, length: length, decimalPositions: decimalPositions, usage: usage });

// ===========================================================================
console.log('\nkeywordSpec.js RECORD_TYPES.SFLSCROLL.definitionRequirements');
{
  const req = KeywordSpec.definitionRequirements('SFLSCROLL');
  check('requirements exist', !!req);
  check('signed numeric (S), length 5, 0 decimals, usage H (default H)',
    req.dataType === 'S' && req.length === 5 && req.decimalPositions === 0 && req.usage.join() === 'H' && req.usageDefault === 'H');
  check('a blank data type with decimals counts as signed numeric', req.dataTypeBlankWithDecimals === true);
  const ref = require('fs').readFileSync(path.join(__dirname, '../../docs/sda-reference/source/DDS_Keyword_V7r6.txt'), 'utf8').replace(/\s+/g, ' ');
  check('citation appears verbatim in DDS_Keyword_V7r6.txt', ref.indexOf(req.ddsReference) !== -1);
}

// ===========================================================================
console.log('\nDspfWriter.sflscrollDefinitionUpdates');
{
  const u = DspfWriter.sflscrollDefinitionUpdates;
  check('already S/5/0/H -> nothing to rewrite (null)', u(fld('S', 5, 0, 'H')) === null);
  check('lower-case s / h are accepted', u(fld('s', '5', '0', 'h')) === null);
  check('blank type WITH decimals 0 is signed numeric -> null', u(fld('', 5, 0, 'H')) === null);
  check('blank type with NO decimals is not numeric -> data type and decimals rewritten',
    JSON.stringify(u(fld('', 5, '', 'H'))) === JSON.stringify({ dataType: 'S', decimalPositions: 0 }));
  check('alpha length-3 output field -> all four rewritten',
    JSON.stringify(u(fld('A', 3, '', 'O'))) === JSON.stringify({ dataType: 'S', length: 5, decimalPositions: 0, usage: 'H' }));
  check('only the wrong property is rewritten (length 4)', JSON.stringify(u(fld('S', 4, 0, 'H'))) === JSON.stringify({ length: 5 }));
  check('only the wrong property is rewritten (usage B)', JSON.stringify(u(fld('S', 5, 0, 'B'))) === JSON.stringify({ usage: 'H' }));
  check('decimals 2 -> rewritten to 0', JSON.stringify(u(fld('S', 5, 2, 'H'))) === JSON.stringify({ decimalPositions: 0 }));
  check('packed (P) is not signed numeric -> rewritten to S', JSON.stringify(u(fld('P', 5, 0, 'H'))) === JSON.stringify({ dataType: 'S' }));
  check('null field is handled', u(null) !== undefined);
}

// ===========================================================================
console.log('\nDspfWriter.sflscrollBasicEditConflictReason (diff-based)');
{
  const b = DspfWriter.sflscrollBasicEditConflictReason;
  const on = [k('SFLSCROLL')];
  const good = fld('S', 5, 0, 'H');
  check('field without SFLSCROLL is never checked', b([], good, { dataType: 'A' }) === null);
  check('unrelated update (no shape property) -> allowed', b(on, good, { name: 'X' }) === null);
  check('data type S -> A blocked, names data type and the required S', /data type A \(must be S\)/.test(b(on, good, { dataType: 'A' })));
  check('length 5 -> 6 blocked', /length 6 \(must be 5\)/.test(b(on, good, { length: 6 })));
  check('decimals 0 -> 2 blocked', /decimal positions 2 \(must be 0\)/.test(b(on, good, { decimalPositions: 2 })));
  check('usage H -> B blocked', /usage B \(must be H\)/.test(b(on, good, { usage: 'B' })));
  check('several at once are all reported', /data type A.*length 6.*usage O/.test(b(on, good, { dataType: 'A', length: 6, usage: 'O' })));
  check('a change TO a conforming value is allowed', b(on, fld('S', 4, 0, 'H'), { length: 5 }) === null);
  check('re-sending the same (already invalid) value is not a change -> allowed', b(on, fld('S', 4, 0, 'H'), { length: 4 }) === null);
  check('an unrelated edit on a hand-written invalid field is never re-reported', b(on, fld('A', 3, '', 'O'), { name: 'Y' }) === null);
  check('S -> blank data type is fine while decimals stay specified (blank+decimals is signed numeric)', b(on, good, { dataType: '' }) === null);
  check('message cites the DDS Reference shape', /5-digit, signed numeric \(data type S\), 0-decimal, hidden \(usage H\) field \(per the DDS Reference\)/.test(b(on, good, { usage: 'B' })));
}

// ===========================================================================
console.log('\nDspfWriter.sflscrollNewConflictReason (commitEdit backstop)');
{
  const n = DspfWriter.sflscrollNewConflictReason;
  const on = [k('SFLSCROLL')];
  check('introducing it on a conforming field -> allowed', n([], on, fld('S', 5, 0, 'H')) === null);
  check('introducing it on a wrong-shaped field -> blocked, lists the problems',
    /this field has data type A \(must be S\), length 3 \(must be 5\)/.test(n([], on, fld('A', 3, '', 'H'))));
  check('shape is judged AFTER the edit: the checkbox\'s own rewrite passes', n([], on, Object.assign(fld('A', 3, '', 'O'), DspfWriter.sflscrollDefinitionUpdates(fld('A', 3, '', 'O')))) === null);
  check('a field that already had SFLSCROLL is never re-reported', n(on, on, fld('A', 3, '', 'O')) === null);
  check('removing SFLSCROLL -> allowed', n(on, [], fld('A', 3, '', 'O')) === null);
  check('an edit not involving SFLSCROLL -> allowed', n([], [k('TEXT')], fld('A', 3, '', 'O')) === null);
}

// ===========================================================================
console.log('\nReferenced-field resolve chain includes the SFLSCROLL shape check');
{
  const f = { keywords: [k('SFLSCROLL')], dataType: 'S', length: 5, decimalPositions: 0, usage: 'H' };
  const r = DspfWriter.referencedFieldResolveConflictReason(f, { length: 10 });
  check('a resolve that changes the length is blocked by the SFLSCROLL check', /SFLSCROLL requires/.test(r || ''));
  check('a resolve that leaves the shape alone is allowed', DspfWriter.referencedFieldResolveConflictReason(f, { length: 5 }) === null);
}

// ===========================================================================
console.log('\nWebview: the SFLSCROLL checkbox brings the field into shape');
const dspfSource = [
  '     A                                      DSPSIZ(24 80 *DS3)',
  '     A          R SFLREC                     SFL',
  "     A            FLD1          10A  O  4  2",
  '     A          R SFLCTLR                    SFLCTL(SFLREC)',
  '     A                                      SFLSIZ(34)',
  '     A                                      SFLPAG(17)',
  "     A            SCRLA          3A  H",
  '     A          R SFLCTLR2                   SFLCTL(SFLREC)',
  '     A                                      SFLSIZ(34)',
  '     A                                      SFLPAG(17)',
  "     A            SCRLB          5S 0H",
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
  const recordSelect = doc.getElementById('recordSelect');
  recordSelect.value = 'SFLCTLR';
  recordSelect.dispatchEvent(new Event('change', { bubbles: true }));
  const scrollBox = () => Array.prototype.slice.call(doc.querySelectorAll('input[type="checkbox"]')).find((el) => el.id.endsWith('-sflscroll'));
  const fieldOf = (recName, name) => {
    const applyEdit = posted.find((m) => m.type === 'applyEdit');
    return applyEdit ? DspfParser.parseDspf(applyEdit.text).records.find((r) => r.name === recName).fields.find((f) => f.name === name) : null;
  };

  check('SCRLA (alpha, length 3, hidden) is selectable', selectHiddenFieldByName(doc, Event, 'SCRLA'));
  let box = scrollBox();
  check('SFLSCROLL checkbox present', !!box);
  box.checked = true;
  box.dispatchEvent(new Event('change', { bubbles: true }));
  let f = fieldOf('SFLCTLR', 'SCRLA');
  check('an edit was posted (not blocked)', !!f && alerts.length === 0);
  check('SFLSCROLL written', !!f && f.keywords.some((x) => x.name === 'SFLSCROLL'));
  check('data type rewritten A -> S', !!f && f.dataType === 'S');
  check('length rewritten 3 -> 5', !!f && Number(f.length) === 5);
  check('decimals rewritten to 0', !!f && Number(f.decimalPositions) === 0);
  check('usage stays H', !!f && f.usage === 'H');
  posted.length = 0;

  console.log('\nWebview: an already-conforming field is not disturbed');
  doc.getElementById('crumb-record').dispatchEvent(new Event('click', { bubbles: true }));
  recordSelect.value = 'SFLCTLR2';
  recordSelect.dispatchEvent(new Event('change', { bubbles: true }));
  check('SCRLB (5S 0H) is selectable', selectHiddenFieldByName(doc, Event, 'SCRLB'));
  box = scrollBox();
  check('checkbox present for SCRLB', !!box);
  if (box && !box.checked) {
    box.checked = true;
    box.dispatchEvent(new Event('change', { bubbles: true }));
  }
  f = fieldOf('SFLCTLR2', 'SCRLB');
  check('SFLSCROLL written, shape unchanged (5S 0H)', !!f && f.keywords.some((x) => x.name === 'SFLSCROLL') && f.dataType === 'S' && Number(f.length) === 5 && Number(f.decimalPositions) === 0 && f.usage === 'H');

  console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : failureCount() + ' CHECK(S) FAILED'));
  process.exit(failureCount() === 0 ? 0 : 1);
}, 1500);

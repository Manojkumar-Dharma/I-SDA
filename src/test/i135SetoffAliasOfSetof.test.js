/**
 * i135SetoffAliasOfSetof.test.js
 *
 * Task I-135 - opened from a deferred finding of the I-121 record-indicator
 * keyword group slice. The DDS Reference says SETOFF "is equivalent to the
 * SETOF keyword" (SETOFF's own section: "The SETOF keyword is preferred";
 * SETOF's: "SETOF is equivalent to the SETOFF keyword" and "Option indicators
 * are not valid for this keyword"). The code treated SETOF fully but SETOFF
 * in none of the places: the Define Indicator Keywords panel, the SFL /
 * SFLMSG / PDNSFLCTL indicator-text rows and the I-95 / I-101 no-option-
 * indicators guard. Now handled the way ROLLUP / ROLLDOWN already are:
 * read as the canonical keyword, written back canonically, and guarded.
 *
 * Run with: node src/test/i135SetoffAliasOfSetof.test.js
 */
const path = require('path');
const { JSDOM } = require('jsdom');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const { check, failureCount } = require('./helpers/harness');

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>');
global.document = dom.window.document;
global.Node = dom.window.Node;
global.DspfWriter = DspfWriter;
const Helpers = require(path.join(__dirname, '../webviewClientHelpers.js'));

const kw = (name, parameters, conditions) => [{ name, parameters, conditions: conditions || [], raw: '', sourceLines: [] }];
const ind = (n) => [{ indicators: [{ number: n, negated: false }] }];
const NAMES = ['INDTXT', 'SETOF', 'CHANGE'];
const names = (list) => list.map((k) => k.name + '(' + k.parameters + ')').join(' ');

console.log('\nspec facts');
{
  check('SETOF lists SETOFF as its alternate name', (KeywordSpec.RECORD_INDICATOR_KEYWORDS.SETOF.alternateNames || []).join() === 'SETOFF');
  check('the alias map now has SETOFF -> SETOF (ROLLUP / ROLLDOWN unchanged)', KeywordSpec.recordIndicatorAlternateKinds().SETOFF === 'SETOF' && KeywordSpec.recordIndicatorAlternateKinds().ROLLUP === 'PAGEDOWN' && KeywordSpec.recordIndicatorAlternateKinds().ROLLDOWN === 'PAGEUP');
  const f = KeywordSpec.noOptionIndicatorsFact('SETOFF');
  check('SETOFF has a noOptionIndicators fact like SETOF (plain, record level)', !!f && f.kind === 'notValid' && f.levels.join() === 'record' && !f.fileLevelOnly);
  check('the fact cites the equivalence', /equivalent to the SETOF keyword/.test(f.ddsReference));
  check('SETOFF is not a member of the ten-kind panel group itself', KeywordSpec.recordIndicatorKeywordNames().indexOf('SETOFF') < 0);
  check('the panel treats SETOFF as non-conditionable through the fact, like SETOF', KeywordSpec.recordIndicatorTakesOptionIndicators('SETOFF') === false && KeywordSpec.recordIndicatorTakesOptionIndicators('SETOF') === false);
}

console.log('\nDefine Indicator Keywords panel model');
{
  const rows = DspfWriter.getRecordIndicatorInstances(kw('SETOFF', '63'));
  check('a SETOFF instance is read as a SETOF row', rows.length === 1 && rows[0].kind === 'SETOF' && rows[0].resp === '63');
  const rewritten = DspfWriter.setRecordIndicatorInstances(kw('SETOFF', '63'), [{ conditions: [], kind: 'SETOF', resp: '64', text: '' }]);
  check('re-writing replaces SETOFF with canonical SETOF (no duplicate left behind)', names(rewritten) === 'SETOF(64)');
  check('clearing the row removes the SETOFF too', DspfWriter.setRecordIndicatorInstances(kw('SETOFF', '63'), []).length === 0);
  check('a real SETOF still reads and writes as before', DspfWriter.getRecordIndicatorInstances(kw('SETOF', '63'))[0].kind === 'SETOF' && names(DspfWriter.setRecordIndicatorInstances([], [{ conditions: [], kind: 'SETOF', resp: '63', text: '' }])) === 'SETOF(63)');
  check('ROLLUP / ROLLDOWN still normalize', DspfWriter.getRecordIndicatorInstances(kw('ROLLUP', '25'))[0].kind === 'PAGEDOWN' && DspfWriter.getRecordIndicatorInstances(kw('ROLLDOWN', '26'))[0].kind === 'PAGEUP');
}

console.log('\nSFL / SFLMSG / PDNSFLCTL indicator-text rows');
{
  const rows = DspfWriter.getIndicatorTextRows(kw('SETOFF', "63 'note'"), NAMES);
  check('a SETOFF instance is read as a SETOF row, indicator and text intact', rows.length === 1 && rows[0].keyword === 'SETOF' && rows[0].indicator === '63' && rows[0].text === 'note');
  const kept = DspfWriter.setIndicatorTextRows(kw('SETOFF', '63'), NAMES, [{ keyword: 'SETOF', indicator: '63', text: '' }]);
  check('re-writing the rows replaces SETOFF with SETOF, no duplicate', names(kept) === 'SETOF(63)');
  const mixed = kw('SETOFF', '63').concat(kw('CHANGE', '40')).concat(kw('DSPATR', 'RI'));
  check('an unrelated keyword survives; SETOFF and CHANGE are the panel\'s to replace', names(DspfWriter.setIndicatorTextRows(mixed, NAMES, [])) === 'DSPATR(RI)');
  check('a names list without SETOF leaves SETOFF alone', DspfWriter.getIndicatorTextRows(kw('SETOFF', '63'), ['INDTXT', 'CHANGE']).length === 0 && names(DspfWriter.setIndicatorTextRows(kw('SETOFF', '63'), ['INDTXT', 'CHANGE'], [])) === 'SETOFF(63)');
  check('other callers\' names are unaffected (COLOR rows, empty, null)', DspfWriter.getIndicatorTextRows(kw('COLOR', 'RED'), ['COLOR']).length === 1 && DspfWriter.getIndicatorTextRows(kw('SETOFF', '1'), []).length === 0 && DspfWriter.getIndicatorTextRows(null, null).length === 0);
  check('INDTXT / CHANGE rows unchanged', DspfWriter.getIndicatorTextRows(kw('INDTXT', "70 'why'"), NAMES)[0].text === 'why' && DspfWriter.getIndicatorTextRows(kw('CHANGE', '40'), NAMES)[0].keyword === 'CHANGE');
}

console.log('\nno-option-indicators guard');
{
  const reason = DspfWriter.noOptionIndicatorsNewConflictReason('SETOFF', [], ind(3));
  check('adding an option indicator to SETOFF is refused, naming SETOFF', /Option indicators are not valid for SETOFF/.test(reason || ''));
  check('the same for SETOF, unchanged', /Option indicators are not valid for SETOF \(/.test(DspfWriter.noOptionIndicatorsNewConflictReason('SETOF', [], ind(3)) || ''));
  check('removing / keeping an indicator already on SETOFF is allowed (fail-open)', DspfWriter.noOptionIndicatorsNewConflictReason('SETOFF', ind(3), []) === null && DspfWriter.noOptionIndicatorsNewConflictReason('SETOFF', ind(3), ind(4)) === null);
  check('an indicator already on a hand-written SETOFF is reported as present', !!DspfWriter.noOptionIndicatorsPresentReason('SETOFF', ind(3)));
  check('SETOFF is in the writer\'s every-level list, right after SETOF', DspfWriter.noOptionIndicatorKeywordNames().indexOf('SETOFF') === DspfWriter.noOptionIndicatorKeywordNames().indexOf('SETOF') + 1);
}

console.log('\nwebview panels');
{
  const root = document.getElementById('root');
  root.innerHTML = Helpers.recordIndicatorInstancesHtml(kw('SETOFF', '63'), 'q', new Set());
  const kinds = Array.from(root.querySelectorAll('select')).map((s) => s.value);
  check('Define Indicator Keywords: a SETOFF shows as a Set off (SETOF) row', kinds.indexOf('SETOF') >= 0);
  check('...and, like SETOF, without a Conditioning toggle', !root.querySelector('.repeat-inst-cond-toggle'));
  root.innerHTML = Helpers.indicatorTextRowsHtml(kw('SETOFF', '63'), 'p', NAMES, 6);
  const sels = Array.from(root.querySelectorAll('select')).map((s) => s.value);
  const inputs = Array.from(root.querySelectorAll('input')).map((i) => i.value);
  check('SFL indicator rows: a SETOFF shows as a SETOF row with its indicator', sels[0] === 'SETOF' && inputs.indexOf('63') >= 0);
}

const fails = failureCount();
console.log(fails ? '\n' + fails + ' CHECK(S) FAILED' : '\nAll checks passed');
process.exit(fails ? 1 : 0);

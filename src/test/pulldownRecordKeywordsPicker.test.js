/**
 * pulldownRecordKeywordsPicker.test.js
 *
 * Direct unit coverage for Task R10's PULLDOWN-specific picker primitive
 * in dspfWriter.js: getPulldownKeyword/setPulldownKeyword (the PULLDOWN
 * keyword's own *SLTIND/*RSTCSR sub-flags). Border Parameters reuse Task
 * F1/R7's getWdwBorder/setWdwBorder as-is - already covered by
 * fileKeywordsPicker.test.js, not duplicated here. Pure Node, no
 * vscode/jsdom needed - see dspfWebview.test.js for the Pull-down tab's
 * DOM-level coverage.
 * Run with: node src/test/pulldownRecordKeywordsPicker.test.js
 */
const path = require('path');
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const DspfParser = require(path.join(__dirname, '../../dist/dspfParser.js'));

let failures = 0;
function check(label, condition) {
  if (condition) {
    console.log('  ok  -', label);
  } else {
    failures++;
    console.log('FAIL  -', label);
  }
}

console.log('getPulldownKeyword / setPulldownKeyword - PULLDOWN present/absent plus *SLTIND/*RSTCSR sub-flags');
{
  let kw = [];
  check('absent by default', DspfWriter.getPulldownKeyword(kw).present === false);

  kw = DspfWriter.setPulldownKeyword(kw, true, false, false);
  let state = DspfWriter.getPulldownKeyword(kw);
  check('present with no sub-flags', state.present === true && state.sltind === false && state.rstcsr === false);
  check('bare PULLDOWN has empty parameters', kw[0].parameters === '');
  check('exactly one keyword added', kw.length === 1 && kw[0].name === 'PULLDOWN');

  kw = DspfWriter.setPulldownKeyword(kw, true, true, false);
  state = DspfWriter.getPulldownKeyword(kw);
  check('*SLTIND alone', state.sltind === true && state.rstcsr === false);
  check('parameters text is *SLTIND', kw[0].parameters === '*SLTIND');

  kw = DspfWriter.setPulldownKeyword(kw, true, true, true);
  state = DspfWriter.getPulldownKeyword(kw);
  check('both sub-flags set', state.sltind === true && state.rstcsr === true);
  check('parameters text has both, space-separated', kw[0].parameters === '*SLTIND *RSTCSR');

  kw = DspfWriter.setPulldownKeyword(kw, true, false, true);
  state = DspfWriter.getPulldownKeyword(kw);
  check('*RSTCSR alone', state.sltind === false && state.rstcsr === true);

  kw = DspfWriter.setPulldownKeyword(kw, false, true, true);
  check('removed entirely when present is false, regardless of sub-flags', kw.length === 0);
}

console.log('\ngetPulldownKeyword / setPulldownKeyword - round-trips through serialize + re-parse, other keywords untouched');
{
  const src =
    [
      '     A          R PDN1                      PULLDOWN',
      "     A                                  1  2'Choice'",
    ].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const lines = src.split(/\r\n|\r|\n/);
  const rec = model.records[0];

  let kw = DspfWriter.setPulldownKeyword(rec.keywords, true, true, true);
  kw = DspfWriter.setWdwBorder(kw, { colorEnabled: true, color: 'BLU', attrsEnabled: false, charsEnabled: false });

  const newLines = DspfWriter.applyRecordUpdate(rec, lines, { keywords: kw });
  const reparsed = DspfParser.parseDspf(newLines.join('\n'));
  const reRec = reparsed.records[0];

  const pd = DspfWriter.getPulldownKeyword(reRec.keywords);
  check('PULLDOWN(*SLTIND *RSTCSR) reads back after reparse', pd.present === true && pd.sltind === true && pd.rstcsr === true);
  const wb = DspfWriter.getWdwBorder(reRec.keywords);
  check('WDWBORDER color reads back after reparse (shared F1/R7 primitive)', wb.color === 'BLU');
  check('the record\'s own field is untouched', reRec.fields.length === 1 && reRec.fields[0].nameType === 'CONSTANT');
}

console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
process.exit(failures === 0 ? 0 : 1);

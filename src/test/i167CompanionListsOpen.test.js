/**
 * i167CompanionListsOpen.test.js
 *
 * Task I-167 - the companion-keyword lists of DATE, USER and SYSNAME. Their
 * sections say "you can specify the location of the field, the X keyword, and,
 * optionally, ..." WITHOUT "only", so the lists are what is available, not a
 * prohibition: they stay OPEN (decision). Only TIME's section says "only", and
 * only TIME is closed (I-154). This pins both the reference text and the behaviour.
 *
 * Run with: node src/test/i167CompanionListsOpen.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const DspfWriter = require(path.join(__dirname, '../dspfWriter.js'));
const DspfParser = require('../../dist/dspfParser.js');
const { check, failureCount } = require('./helpers/harness');

const REF = fs.readFileSync(path.join(__dirname, '../../docs/sda-reference/source/DDS_Keyword_V7r6.txt'), 'utf8')
  .replace(/\f/g, ' ').replace(/\s+/g, ' ');

console.log('\n1. the reference wording');
{
  check('TIME says "only"', REF.indexOf('You can specify only the location of the field, TIME, and optionally') >= 0);
  check('DATE says "optionally" with no "only"', REF.indexOf('You can specify the location of the field, the DATE keyword, and, optionally,') >= 0 && REF.indexOf('only the location of the field, the DATE') < 0);
  check('USER says "optionally" with no "only"', REF.indexOf('You can specify the location of the field, the USER keyword, and, optionally,') >= 0 && REF.indexOf('only the location of the field, the USER') < 0);
  check('SYSNAME says "optionally" with no "only"', REF.indexOf('You can specify the location of the field, the SYSNAME keyword, and, optionally,') >= 0 && REF.indexOf('only the location of the field, the SYSNAME') < 0);
}

console.log('\n2. the spec facts');
{
  const L = KeywordSpec.listedCompanionKeywords;
  check('DATE lists EDTCDE, EDTWRD, COLOR, DSPATR, TEXT', JSON.stringify(L('DATE')) === JSON.stringify(['EDTCDE', 'EDTWRD', 'COLOR', 'DSPATR', 'TEXT']));
  check('USER lists COLOR, DSPATR, TEXT', JSON.stringify(L('USER')) === JSON.stringify(['COLOR', 'DSPATR', 'TEXT']));
  check('SYSNAME lists COLOR, DSPATR, TEXT', JSON.stringify(L('SYSNAME')) === JSON.stringify(['COLOR', 'DSPATR', 'TEXT']));
  check('only TIME is closed', KeywordSpec.companionsStatedAsOnly('TIME') === true &&
    ['DATE', 'USER', 'SYSNAME'].every((k) => KeywordSpec.companionsStatedAsOnly(k) === false));
}

console.log('\n3. behaviour: the three stay open, TIME stays closed');
{
  const reason = (kw, extra) => {
    const base = '     A          R R1\n     A                                  2  2' + kw + '\n';
    return DspfWriter.systemValueKeywordNewConflictReason(DspfParser.parseDspf(base), DspfParser.parseDspf(base + '     A                                      ' + extra + '\n'));
  };
  ['DATE', 'USER', 'SYSNAME'].forEach((kw) => {
    ["DFT('X')", 'DUP', 'CHECK(ME)', 'COLOR(RED)', "TEXT('t')"].forEach((x) => {
      check(kw + ' + ' + x + ' is not refused by the companion rule', reason(kw, x) === null);
    });
  });
  ["DFT('X')", 'DUP', 'CHECK(ME)'].forEach((x) => {
    const r = reason('TIME', x);
    check('TIME + ' + x + ' is still refused and says "only"', typeof r === 'string' && /specify only the location of the field, TIME/.test(r));
  });
}

console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : 'FAIL - ' + failureCount() + ' check(s) failed'));
process.exit(failureCount() === 0 ? 0 : 1);

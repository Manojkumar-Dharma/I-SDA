/**
 * e8gWindowGeometryKeepsOptions.test.js
 *
 * Task E8g - DspfWriter.setWindowGeometry rewrites only the geometry numbers of WINDOW and keeps every token after
 * them (*MSGLIN / *NOMSGLIN, *RSTCSR / *NORSTCSR), for both forms: WINDOW(line pos lines positions ...) and
 * WINDOW(*DFT lines positions ...). Before, a resize or move gave WINDOW(4 20 10 30) for
 * WINDOW(4 20 9 30 *NOMSGLIN *NORSTCSR), losing the options.
 *
 * Run with: node src/test/e8gWindowGeometryKeepsOptions.test.js
 */
'use strict';

const path = require('path');
const DspfParser = require(path.join(__dirname, '../../dist/dspfParser.js'));
const DspfWriter = require('../dspfWriter.js');
const { check, failureCount } = require('./helpers/harness');
const { buildLine } = require('../fixtures/lineBuilder');
const { leaseDspfPage } = require('./helpers/common');

const edit = (params, geometry) => {
  const src = [
    buildLine({ seq: '00010', nameType: 'R', name: 'W1' }),
    buildLine({ seq: '00020', func: 'WINDOW(' + params + ')' }),
    buildLine({ seq: '00030', name: 'F1', dataType: 'A', length: '5', usage: 'B', line: '2', col: '2' }),
  ].join('\n') + '\n';
  const model = DspfParser.parseDspf(src);
  const out = DspfWriter.setWindowGeometry(model.records[0], src.split(/\r\n|\r|\n/), geometry);
  const kw = DspfParser.parseDspf(out.join('\n') + '\n').records[0].keywords.find((k) => k.name === 'WINDOW');
  return kw.parameters.trim().replace(/\s+/g, ' ');
};

console.log('E8g: WINDOW(line pos lines positions ...)');
check('resize keeps *NOMSGLIN *NORSTCSR', edit('4 20 9 30 *NOMSGLIN *NORSTCSR', { height: 10, width: 40 }) === '4 20 10 40 *NOMSGLIN *NORSTCSR');
check('move keeps them too', edit('4 20 9 30 *NOMSGLIN *NORSTCSR', { row: 6, col: 22 }) === '6 22 9 30 *NOMSGLIN *NORSTCSR');
check('move and resize together keep them', edit('4 20 9 30 *NOMSGLIN *NORSTCSR', { row: 5, col: 10, height: 8, width: 25 }) === '5 10 8 25 *NOMSGLIN *NORSTCSR');
check('a single trailing option is kept', edit('4 20 9 30 *MSGLIN', { height: 7 }) === '4 20 7 30 *MSGLIN');
check('the other single option is kept', edit('4 20 9 30 *RSTCSR', { width: 31 }) === '4 20 9 31 *RSTCSR');
check('no trailing options: unchanged behaviour', edit('4 20 9 30', { height: 10, width: 40 }) === '4 20 10 40');

console.log('E8g: WINDOW(*DFT lines positions ...)');
check('resize keeps *NOMSGLIN *NORSTCSR', edit('*DFT 9 30 *NOMSGLIN *NORSTCSR', { height: 10, width: 40 }) === '*DFT 10 40 *NOMSGLIN *NORSTCSR');
check('a height-only resize keeps a single option', edit('*DFT 9 30 *NORSTCSR', { height: 12 }) === '*DFT 12 30 *NORSTCSR');
check('no trailing options: unchanged behaviour', edit('*DFT 9 30', { width: 31 }) === '*DFT 9 31');
let threw = false;
try { edit('*DFT 9 30 *NOMSGLIN', { row: 3 }); } catch (e) { threw = true; }
check('moving a *DFT window is still refused', threw);

console.log('E8g: resizing from the designer page');
{
  const src = [
    buildLine({ seq: '00010', nameType: 'R', name: 'W1' }),
    buildLine({ seq: '00020', func: 'WINDOW(4 20 9 30 *NOMSGLIN *NORSTCSR)' }),
    buildLine({ seq: '00030', name: 'F1', dataType: 'A', length: '5', usage: 'B', line: '2', col: '2' }),
  ].join('\n') + '\n';
  const posted = [];
  const dom = leaseDspfPage(src, 'E8GWINDOW.DSPF', { posted: posted, rect: true });
  setTimeout(() => {
    const { MouseEvent } = dom.window;
    const handle = dom.window.document.querySelector('.dspf-window-border .dspf-window-resize-handle');
    posted.length = 0;
    handle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 300, clientY: 100 }));
    dom.window.dispatchEvent(new MouseEvent('mousemove', { clientX: 400, clientY: 300 }));
    dom.window.dispatchEvent(new MouseEvent('mouseup', {}));
    const last = posted[posted.length - 1];
    // the keyword wraps onto a continuation line at column 80, so read it back through the parser
    const kw = last && last.type === 'applyEdit' ? DspfParser.parseDspf(last.text).records[0].keywords.find((k) => k.name === 'WINDOW') : null;
    check('the page posts the resized WINDOW with both options kept', !!kw && /^4 20 \d+ \d+ \*NOMSGLIN \*NORSTCSR$/.test(kw.parameters.trim().replace(/\s+/g, ' ')) && !/^4 20 9 30 /.test(kw.parameters.trim()));
    if (failureCount() > 0) process.exit(1);
    console.log('\nALL CHECKS PASSED');
    process.exit(0);
  }, 0);
}

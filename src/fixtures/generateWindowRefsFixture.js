const fs = require('fs');
const path = require('path');
const { buildLine } = require('./lineBuilder');

const lines = [];

// --- Base window with direct geometry ---
lines.push(buildLine({ seq: '00600', nameType: 'R', name: 'BASEWIN', func: 'WINDOW(6 15 8 40)' }));
lines.push(buildLine({ seq: '00601', func: "WDWTITLE((*TEXT 'Base'))" }));
lines.push(buildLine({ seq: '00602', name: 'BF1', length: '10', dataType: 'A', usage: 'B', line: '1', col: '2' }));

// --- Second record inheriting BASEWIN's geometry ---
lines.push(buildLine({ seq: '00610', nameType: 'R', name: 'SHAREDWIN', func: 'WINDOW(BASEWIN)' }));
lines.push(buildLine({ seq: '00611', name: 'SF1', length: '12', dataType: 'A', usage: 'B', line: '1', col: '2' }));

// --- *DFT positioned window (system determines line/col at runtime) ---
lines.push(buildLine({ seq: '00620', nameType: 'R', name: 'DFTWIN', func: 'WINDOW(*DFT 5 25)' }));
lines.push(buildLine({ seq: '00621', name: 'DF1', length: '8', dataType: 'A', usage: 'B', line: '1', col: '2' }));

// --- Field-name (program-to-system) dynamic position ---
lines.push(buildLine({ seq: '00630', nameType: 'R', name: 'DYNWIN', func: 'WINDOW(&STRLIN &STRCOL 7 30)' }));
lines.push(buildLine({ seq: '00631', name: 'STRLIN', length: '3', dataType: 'S', decimals: '0', usage: 'P', line: '', col: '' }));
lines.push(buildLine({ seq: '00632', name: 'STRCOL', length: '3', dataType: 'S', decimals: '0', usage: 'P', line: '', col: '' }));
lines.push(buildLine({ seq: '00633', name: 'YF1', length: '9', dataType: 'A', usage: 'B', line: '1', col: '2' }));

fs.writeFileSync(path.join(__dirname, 'sample-window-refs.dspf'), lines.join('\n') + '\n');
console.log('Wrote sample-window-refs.dspf with', lines.length, 'lines');

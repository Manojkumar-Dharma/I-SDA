const fs = require('fs');
const path = require('path');
const { buildLine } = require('./lineBuilder');

const lines = [];

// --- Menu bar record ---
lines.push(buildLine({ seq: '00500', nameType: 'R', name: 'MB', func: 'MNUBAR' }));
lines.push(buildLine({ seq: '00501', name: 'MNUFLD', length: '2', dataType: 'Y', decimals: '0', usage: 'B', line: '1', col: '2', func: "MNUBARCHC(1 PULLFILE '>File')" }));
lines.push(buildLine({ seq: '00502', func: "MNUBARCHC(2 PULLEDIT '>Edit')" }));

// --- File pulldown ---
lines.push(buildLine({ seq: '00510', nameType: 'R', name: 'PULLFILE', func: 'PULLDOWN' }));
lines.push(buildLine({ seq: '00511', name: 'F1', length: '2', dataType: 'Y', decimals: '0', usage: 'B', line: '1', col: '2', func: 'SNGCHCFLD(*AUTOENT)' }));
lines.push(buildLine({ seq: '00512', func: "CHOICE(1 '>Open')" }));
lines.push(buildLine({ seq: '00513', func: "CHOICE(2 '>Save')" }));
lines.push(buildLine({ seq: '00514', func: "CHOICE(3 '>Exit')" }));

// --- Edit pulldown ---
lines.push(buildLine({ seq: '00520', nameType: 'R', name: 'PULLEDIT', func: 'PULLDOWN' }));
lines.push(buildLine({ seq: '00521', name: 'F2', length: '2', dataType: 'Y', decimals: '0', usage: 'B', line: '1', col: '2', func: 'SNGCHCFLD' }));
lines.push(buildLine({ seq: '00522', func: "CHOICE(1 '>Cut')" }));
lines.push(buildLine({ seq: '00523', func: "CHOICE(2 '>Copy')" }));
lines.push(buildLine({ seq: '00524', func: "CHOICE(3 '>Paste')" }));

// --- Application record shown beneath the menu bar ---
lines.push(buildLine({ seq: '00530', nameType: 'R', name: 'APPSCR' }));
lines.push(buildLine({ seq: '00531', line: '3', col: '3', func: "'Application content goes here'" }));

fs.writeFileSync(path.join(__dirname, 'sample-menubar.dspf'), lines.join('\n') + '\n');
console.log('Wrote sample-menubar.dspf with', lines.length, 'lines');

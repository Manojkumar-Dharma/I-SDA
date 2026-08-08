const fs = require('fs');
const path = require('path');
const { buildLine } = require('./lineBuilder');

const lines = [];

// --- Subfile pair: SFLREC (one row template) + SFLCTLR (control record) ---
lines.push(buildLine({ seq: '00200', nameType: 'R', name: 'SFLREC', func: 'SFL' }));
lines.push(buildLine({ seq: '00201', name: 'ROWNAME', length: '20', dataType: 'A', usage: 'O', line: '2', col: '2' }));
lines.push(buildLine({ seq: '00202', name: 'ROWAMT', length: '9', dataType: 'S', decimals: '2', usage: 'O', line: '2', col: '25' }));

lines.push(buildLine({ seq: '00210', nameType: 'R', name: 'SFLCTLR', func: 'SFLCTL(SFLREC)' }));
lines.push(buildLine({ seq: '00211', func: 'SFLSIZ(0020)' }));
lines.push(buildLine({ seq: '00212', func: 'SFLPAG(0004)' }));
lines.push(buildLine({ seq: '00213', func: 'SFLDSP' }));
lines.push(buildLine({ seq: '00214', func: 'SFLDSPCTL' }));
lines.push(buildLine({ seq: '00215', func: "SFLCLR" }));
lines.push(buildLine({ seq: '00216', line: '1', col: '2', func: "'Name'" }));
lines.push(buildLine({ seq: '00217', line: '1', col: '25', func: "'Amount'" }));

// --- Windowed record ---
lines.push(buildLine({ seq: '00300', nameType: 'R', name: 'CONFIRM', func: 'WINDOW(8 20 6 40)' }));
lines.push(buildLine({ seq: '00301', func: "WDWTITLE((*TEXT 'Confirm'))" }));
lines.push(buildLine({ seq: '00302', line: '2', col: '3', func: "'Are you sure?'" }));
lines.push(buildLine({ seq: '00303', name: 'YESNO', length: '1', dataType: 'A', usage: 'B', line: '4', col: '3' }));

// --- Radio group (SNGCHCFLD) ---
lines.push(buildLine({ seq: '00400', nameType: 'R', name: 'PREFS' }));
lines.push(buildLine({ seq: '00401', name: 'SHIPOPT', length: '2', dataType: 'Y', decimals: '0', usage: 'B', line: '3', col: '5', func: 'SNGCHCFLD' }));
lines.push(buildLine({ seq: '00402', func: "CHOICE(1 'Standard')" }));
lines.push(buildLine({ seq: '00403', func: "CHOICE(2 'Express')" }));
lines.push(buildLine({ seq: '00404', func: "CHOICE(3 'Overnight')" }));

// --- Checkbox group (MLTCHCFLD) ---
lines.push(buildLine({ seq: '00410', name: 'TOPPINGS', length: '2', dataType: 'Y', decimals: '0', usage: 'B', line: '8', col: '5', func: 'MLTCHCFLD' }));
lines.push(buildLine({ seq: '00411', func: "CHOICE(1 'Cheese')" }));
lines.push(buildLine({ seq: '00412', func: "CHOICE(2 'Pepperoni')" }));

// --- Push button ---
lines.push(buildLine({ seq: '00420', name: 'SUBMIT', length: '1', dataType: 'A', usage: 'B', line: '12', col: '5', func: 'PSHBTNFLD' }));
lines.push(buildLine({ seq: '00421', func: "PSHBTNCHC('Submit Order')" }));

fs.writeFileSync(path.join(__dirname, 'sample-widgets.dspf'), lines.join('\n') + '\n');
console.log('Wrote sample-widgets.dspf with', lines.length, 'lines');

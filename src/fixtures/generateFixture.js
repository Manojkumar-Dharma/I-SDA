const fs = require('fs');
const path = require('path');
const { buildLine } = require('./lineBuilder');

const lines = [];

// --- IBM's own example (DDS for display files, "Defining a display file for DDS") ---
lines.push(buildLine({ seq: '00100', comment: ' DISPLAY FILE EXAMPLE' }));
lines.push(buildLine({ seq: '00101', comment: '' }));
lines.push(buildLine({ seq: '00102', func: 'REF(PAYROLL)' }));
lines.push(buildLine({ seq: '00103', nameType: 'R', name: 'MENU' }));
lines.push(buildLine({ seq: '00104', nameType: 'H', func: 'HLPARA(1 1 12 80)' }));
lines.push(buildLine({ seq: '00105', func: 'HLPRCD(RECORD1 FILEA)' }));
lines.push(buildLine({ seq: '00106', ind1: 'N01' }));
lines.push(
  buildLine({
    seq: '00107',
    relation: 'OR',
    ind1: '02',
    name: 'FLDA',
    length: '20',
    dataType: 'I',
    decimals: '2',
    usage: 'O',
    line: '2',
    col: '2',
    func: 'DSPATR(HI)',
  })
);
lines.push(
  buildLine({
    seq: '00108',
    name: 'FLDB',
    length: '22',
    dataType: 'N',
    decimals: '2',
    usage: 'B',
    line: '3',
    col: '2',
  })
);
lines.push(buildLine({ seq: '00109', ind1: '72', ind2: '73' }));
lines.push(buildLine({ seq: '00110', relation: 'OR', ind1: '60', ind2: '61', ind3: '62' }));
lines.push(buildLine({ seq: '00111', relation: 'AND', ind1: '63', func: 'DSPATR(HI)' }));
lines.push(
  buildLine({
    seq: '00112',
    name: 'FLDC',
    length: '7',
    dataType: 'Y',
    decimals: '0',
    usage: 'B',
    line: '7',
    col: '20',
    func: 'DSPATR(RI PC)',
  })
);
lines.push(buildLine({ seq: '00113', ind1: '42', ind2: '43' }));
lines.push(buildLine({ seq: '00114', relation: 'OR', ind1: '60', ind2: '61' }));
lines.push(buildLine({ seq: '00115', relation: 'OR', ind1: '62', line: '9', col: '2', func: "'Constant'" }));
lines.push(buildLine({ seq: '00116', name: 'FLDD', ref: 'R', line: '11', col: '2' }));

// --- Continuation (+) across two lines ---
lines.push(
  buildLine({
    seq: '00117',
    name: 'LONGTXT',
    length: '50',
    dataType: 'A',
    usage: 'B',
    line: '12',
    col: '5',
    func: "TEXT('This is a long+",
  })
);
lines.push(buildLine({ seq: '00118', func: "keyword continuation test')" }));

// --- Continuation with '-' (inserts a blank at the join) ---
lines.push(
  buildLine({
    seq: '00119',
    name: 'SPACEDTXT',
    length: '30',
    dataType: 'A',
    usage: 'B',
    line: '13',
    col: '5',
    func: "TEXT('joined with-",
  })
);
lines.push(buildLine({ seq: '00120', func: "a space')" }));

// --- Multiple keywords on one line + relative column (+n) ---
lines.push(
  buildLine({
    seq: '00121',
    name: 'FLDE',
    length: '10',
    dataType: 'A',
    usage: 'I',
    line: '14',
    col: '+5',
    func: 'DSPATR(HI) COLOR(BLU) TEXT(\'A field\')',
  })
);

fs.writeFileSync(path.join(__dirname, 'sample.dspf'), lines.join('\n') + '\n');
console.log('Wrote sample.dspf with', lines.length, 'lines');

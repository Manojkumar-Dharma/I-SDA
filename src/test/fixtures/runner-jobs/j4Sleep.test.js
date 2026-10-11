// Sleeps (so parallel runs overlap even on one core), writes a fixed name in the temp directory and reads it
// back after the others have had time to write theirs: it only reads its own text if the slot's temp
// directory is private.
const fs = require('fs');
const os = require('os');
const path = require('path');
const mine = 'j4-' + process.pid;
const file = path.join(os.tmpdir(), 'isda-e7b-collide.txt');
fs.writeFileSync(file, mine);
console.log('  ok  - j4 start');
setTimeout(() => {
  console.log(fs.readFileSync(file, 'utf8') === mine ? '  ok  - j4 temp file is its own' : 'FAIL  - j4 temp file was overwritten by another file');
  console.log('  ok  - j4 end');
  process.exit(0);
}, 800);

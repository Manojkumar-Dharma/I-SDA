// Sleeps (so pool workers overlap even on one core), prints the pid it runs in, and checks that the temp
// directory of its pool slot is private: it writes a fixed name, waits, and reads it back.
const fs = require('fs');
const os = require('os');
const path = require('path');
const mine = 'k3-' + process.pid;
const file = path.join(os.tmpdir(), 'isda-e7m-collide.txt');
fs.writeFileSync(file, mine);
console.log('  ok  - pid:' + process.pid);
setTimeout(() => {
  console.log(fs.readFileSync(file, 'utf8') === mine ? '  ok  - k3 temp file is its own' : 'FAIL  - k3 temp file was overwritten by another file');
  process.exit(0);
}, 500);

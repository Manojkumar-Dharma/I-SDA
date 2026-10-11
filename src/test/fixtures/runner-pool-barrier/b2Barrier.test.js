// Passes only if the other two barrier files run at the same time: each writes its name into the shared
// directory named by ISDA_E7M_BARRIER and waits (at most 25 s) until all three names are there.
const fs = require('fs');
const path = require('path');
const dir = process.env.ISDA_E7M_BARRIER;
fs.writeFileSync(path.join(dir, 'b2'), String(process.pid));
const t0 = Date.now();
const timer = setInterval(() => {
  const seen = fs.readdirSync(dir).length;
  if (seen >= 3) {
    clearInterval(timer);
    console.log('  ok  - b2 ran together with the other two');
    console.log('  ok  - pid:' + process.pid);
    process.exit(0);
  }
  if (Date.now() - t0 > 25000) {
    clearInterval(timer);
    console.log('FAIL  - b2 waited 25 s and the other files never ran at the same time');
    process.exit(1);
  }
}, 20);

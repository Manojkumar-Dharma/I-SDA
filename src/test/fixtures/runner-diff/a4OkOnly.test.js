// Differs from isolated mode ONLY in the ok count: both modes pass with 0 failed.
const clean = [].__isdaLeak === undefined;
console.log('  ok  - base check');
if (!clean) console.log('  ok  - extra check seen only when polluted');
process.exit(0);

// Differs ONLY in the failed count: it fails in both modes, with 1 or 2 failing checks, and prints no ok lines.
const clean = [].__isdaLeak === undefined;
console.log('FAIL  - base failure');
if (!clean) console.log('FAIL  - extra failure seen only when polluted');
process.exit(1);

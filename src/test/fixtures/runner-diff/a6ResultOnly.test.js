// Differs ONLY in the result: one ok line and no FAIL line in both modes, but exit 1 when polluted.
const clean = [].__isdaLeak === undefined;
console.log('  ok  - one check');
process.exit(clean ? 0 : 1);

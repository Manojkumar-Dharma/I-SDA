// Sees the pollution only when it shares a process with a2Pollute.
const clean = [].__isdaLeak === undefined;
console.log(clean ? '  ok  - prototype is clean' : 'FAIL  - prototype is polluted');
process.exit(clean ? 0 : 1);

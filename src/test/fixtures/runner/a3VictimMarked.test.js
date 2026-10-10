// @isda-test: isolate
const clean = [].__isdaLeak === undefined;
console.log(clean ? '  ok  - prototype is clean (marked file)' : 'FAIL  - prototype is polluted (marked file)');
process.exit(clean ? 0 : 1);

// Pollutes a built-in prototype, which the shared worker does not reset.
Array.prototype.__isdaLeak = 1;
console.log('  ok  - polluted a prototype');
process.exit(0);

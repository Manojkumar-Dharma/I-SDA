// Keeps 400 MB alive on an object the worker does not reset: a real leak.
process.__e7kKeep = Buffer.alloc(400 * 1024 * 1024, 1);
console.log('  ok  - pid:' + process.pid);
process.exit(0);

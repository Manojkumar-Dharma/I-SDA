// Kills the worker process it runs in.
console.log('  ok  - before the crash');
process.kill(process.pid, 'SIGKILL');

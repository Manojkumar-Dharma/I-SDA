// Kills the worker process it runs in, while another slot's file is still running.
console.log('  ok  - before the crash');
process.kill(process.pid, 'SIGKILL');

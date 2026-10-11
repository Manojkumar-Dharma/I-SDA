console.log('  ok  - f2 first');
setTimeout(() => { console.log('FAIL  - f2 deliberate failure'); process.exit(1); }, 100);

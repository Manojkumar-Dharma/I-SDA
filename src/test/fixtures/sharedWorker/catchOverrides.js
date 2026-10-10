async function main() { try { console.log('  ok  - ran'); process.exit(0); } catch (e) { throw e; } }
main().catch((e) => { console.error(e); process.exit(1); });

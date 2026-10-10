global.leakedGlobal = 1; process.env.E7I_LEAK = 'yes'; setInterval(() => { global.tickAfterEnd = true; }, 20); process.exit(0);

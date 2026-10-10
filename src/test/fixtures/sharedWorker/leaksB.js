console.log('global:' + typeof global.leakedGlobal + ' env:' + String(process.env.E7I_LEAK)); setTimeout(() => { console.log('tick:' + String(global.tickAfterEnd)); process.exit(0); }, 80);

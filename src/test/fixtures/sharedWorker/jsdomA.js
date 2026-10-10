const { JSDOM } = require('jsdom'); const d = new JSDOM('<p>x</p>'); process.__e7iWin = d.window; console.log('document while open:' + typeof d.window.document); process.exit(0);

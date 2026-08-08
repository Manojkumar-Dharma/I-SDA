const fs = require('fs');
const path = require('path');
const { parseDspf } = require('../../dist/dspfParser');

const src = fs.readFileSync(path.join(__dirname, 'sample.dspf'), 'utf8');
const result = parseDspf(src);

console.log('=== ERRORS ===');
console.log(JSON.stringify(result.errors, null, 2));

console.log('=== FILE-LEVEL KEYWORDS ===');
console.log(result.fileKeywords.map((k) => k.raw));

console.log('=== RECORDS ===');
for (const rec of result.records) {
  console.log(`Record: ${rec.name} (line ${rec.sourceLine})`);
  console.log('  record-level keywords:', rec.keywords.map((k) => k.raw));
  console.log('  help entries:', rec.helpEntries.length);
  for (const f of rec.fields) {
    const loc = `${f.location.line ?? '?'}/${f.location.column ?? (f.location.relativeColumnOffset != null ? '+' + f.location.relativeColumnOffset : '?')}`;
    console.log(
      `  [${f.nameType}] name="${f.name}" len=${f.length} type=${f.dataType} dec=${f.decimalPositions} usage=${f.usage} loc=${loc} const="${f.constantValue ?? ''}" conditions=${JSON.stringify(
        f.conditions
      )} keywords=${JSON.stringify(f.keywords.map((k) => ({ name: k.name, params: k.parameters, cond: k.conditions })))}`
    );
  }
}

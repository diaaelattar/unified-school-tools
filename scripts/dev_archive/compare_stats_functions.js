const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const f1 = path.join(root, 'Nepras_v1.3.1/modules/school_stats.js');
const f2 = path.join(root, 'Nepras_apps/extension/modules/school_stats.js');

const text1 = fs.readFileSync(f1, 'utf8');
const text2 = fs.readFileSync(f2, 'utf8');

function getFns(t) {
  const fns = [];
  const lines = t.split('\n');
  lines.forEach((l, i) => {
    let m = l.match(/(?:async\s+)?function\s+([a-zA-Z0-9_$]+)\s*\(/);
    if (m) fns.push({ name: m[1], line: i + 1 });
  });
  return fns;
}

const fns1 = getFns(text1);
const fns2 = getFns(text2);

console.log('Functions in v1.3.1 school_stats.js:', fns1.map(f => f.name));
console.log('Functions in Nepras_apps school_stats.js:', fns2.map(f => f.name));

const onlyIn1 = fns1.filter(f => !fns2.some(x => x.name === f.name));
const onlyIn2 = fns2.filter(f => !fns1.some(x => x.name === f.name));

console.log('Functions ONLY in v1.3.1:', onlyIn1);
console.log('Functions ONLY in Nepras_apps:', onlyIn2);

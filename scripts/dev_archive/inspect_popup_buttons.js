const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const p1 = path.join(root, 'Nepras_v1.3.1/popup.js');
const text1 = fs.readFileSync(p1, 'utf8');
const lines1 = text1.split('\n');

function printFunction(name) {
  console.log(`\n=================== SEARCHING: ${name} ===================`);
  lines1.forEach((l, i) => {
    if (l.includes(name)) {
      console.log(`Found around line ${i + 1}:`);
      console.log(lines1.slice(Math.max(0, i - 10), Math.min(lines1.length, i + 50)).join('\n'));
      console.log('----------------------------------------------------');
    }
  });
}

printFunction('btnExpensesRefresh');
printFunction('btnStatsCollect');
printFunction('btnSchoolStats');
printFunction('expenses');

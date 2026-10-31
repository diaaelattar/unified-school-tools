const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const bg = fs.readFileSync(path.join(root, 'Nepras_apps/extension/background.js'), 'utf8');

const lines = bg.split('\n');
console.log('=== SEARCHING NEPRAS_EXPENSES_REMOTE_DATA IN BACKGROUND.JS ===');
lines.forEach((l, i) => {
  if (l.includes('NEPRAS_EXPENSES_REMOTE_DATA')) {
    console.log(`Line ${i + 1}: ${l.trim()}`);
    console.log(lines.slice(i, i + 80).join('\n'));
    console.log('---');
  }
});

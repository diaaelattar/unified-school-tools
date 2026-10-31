const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const bg = fs.readFileSync(path.join(root, 'Nepras_apps/extension/background.js'), 'utf8');

const lines = bg.split('\n');
console.log('=== SEARCHING neprasExpensesRemoteBackgroundV1763 IN BACKGROUND.JS ===');
lines.forEach((l, i) => {
  if (l.includes('neprasExpensesRemoteBackgroundV1763')) {
    console.log(`Line ${i + 1}: ${l.trim()}`);
    console.log(lines.slice(i, i + 60).join('\n'));
    console.log('---');
  }
});

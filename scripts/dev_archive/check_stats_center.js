const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const p = path.join(root, 'Nepras_apps/extension/popup.js');
const text = fs.readFileSync(p, 'utf8');
const lines = text.split('\n');

console.log('=== SEARCHING STATS-CENTER IN POPUP.JS ===');
lines.forEach((l, i) => {
  if (l.includes('stats-center') || l.includes('statsCenter') || l.includes('StatsDashboard')) {
    console.log(`Line ${i + 1}: ${l.trim()}`);
    console.log(lines.slice(Math.max(0, i - 2), Math.min(lines.length, i + 15)).join('\n'));
    console.log('---');
  }
});
